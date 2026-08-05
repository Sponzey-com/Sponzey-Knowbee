export type AgentOperationalSettingsStatus = "enabled" | "disabled" | "archived" | "degraded"
export type AgentOperationalRiskLevel = "safe" | "moderate" | "external" | "sensitive" | "dangerous"

export interface AgentOperationalSettingsProjection {
  agentRef: string
  status: AgentOperationalSettingsStatus
  revision: number
  model: {
    configured: boolean
    availability: "configured" | "unavailable"
    providerName?: string
    modelName?: string
    effort?: string
    fallbackModelName?: string
  }
  memory: {
    retentionPolicy: "session" | "short_term" | "long_term"
    capsuleMode: "session_compaction" | "rolling_summary"
    rawWindowSize: number | null
    compactThreshold: number | null
    writebackReviewRequired: boolean
    lastCompactedAt: number | null
    capsuleCount: number
  }
  permission: {
    riskCeiling: AgentOperationalRiskLevel
    approvalRequiredFrom: AgentOperationalRiskLevel
    allowExternalNetwork: boolean
    allowFilesystemWrite: boolean
    allowShellExecution: boolean
    allowScreenControl: boolean
    allowedPathCount: number
  }
  diagnosticCodes: string[]
  observedAt: number
}

export interface AgentOperationalSettingsProjectionSource {
  agentRef: string
  status: unknown
  profileVersion: number
  modelProfile?: unknown
  memoryPolicy: unknown
  permissionProfile: unknown
  observedAt: number
}

const AGENT_REF_PATTERN = /^agent_v1_[a-f0-9]{24}$/u
const STATUSES = new Set<AgentOperationalSettingsStatus>([
  "enabled",
  "disabled",
  "archived",
  "degraded",
])
const RISKS = new Set<AgentOperationalRiskLevel>([
  "safe",
  "moderate",
  "external",
  "sensitive",
  "dangerous",
])

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function optionalNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
}

function projectModel(
  value: unknown,
  diagnosticCodes: string[],
): AgentOperationalSettingsProjection["model"] {
  if (value === undefined || value === null) {
    diagnosticCodes.push("agent_model_unconfigured")
    return { configured: false as const, availability: "unavailable" as const }
  }
  const input = record(value)
  const providerName = nonEmptyText(input?.providerId)
  const modelName = nonEmptyText(input?.modelId)
  const effort = input?.effort === undefined ? undefined : nonEmptyText(input.effort)
  const fallbackModelName =
    input?.fallbackModelId === undefined ? undefined : nonEmptyText(input.fallbackModelId)
  if (!input || !providerName || !modelName || effort === null || fallbackModelName === null) {
    diagnosticCodes.push("agent_model_profile_invalid")
    return { configured: false as const, availability: "unavailable" as const }
  }
  return {
    configured: true as const,
    availability: "configured" as const,
    providerName,
    modelName,
    ...(effort ? { effort } : {}),
    ...(fallbackModelName ? { fallbackModelName } : {}),
  }
}

function invalidMemory(): AgentOperationalSettingsProjection["memory"] {
  return {
    retentionPolicy: "session" as const,
    capsuleMode: "session_compaction" as const,
    rawWindowSize: null,
    compactThreshold: null,
    writebackReviewRequired: false,
    lastCompactedAt: null,
    capsuleCount: 0,
  }
}

function projectMemory(
  value: unknown,
  diagnosticCodes: string[],
): AgentOperationalSettingsProjection["memory"] {
  const input = record(value)
  const retentionPolicy = input?.retentionPolicy
  const capsuleMode = input?.capsuleMode ?? "session_compaction"
  const rawWindowSize = optionalNonNegativeInteger(input?.rawWindowSize)
  const compactThreshold = optionalNonNegativeInteger(input?.compactThreshold)
  const lastCompactedAt =
    input?.lastCompactedAt === undefined ? null : optionalNonNegativeInteger(input.lastCompactedAt)
  const capsuleCount = optionalNonNegativeInteger(input?.capsuleCount ?? 0)
  const valid =
    input !== null &&
    (retentionPolicy === "session" ||
      retentionPolicy === "short_term" ||
      retentionPolicy === "long_term") &&
    (capsuleMode === "session_compaction" || capsuleMode === "rolling_summary") &&
    typeof input.writebackReviewRequired === "boolean" &&
    (input.rawWindowSize === undefined || rawWindowSize !== null) &&
    (input.compactThreshold === undefined || compactThreshold !== null) &&
    (input.lastCompactedAt === undefined || lastCompactedAt !== null) &&
    capsuleCount !== null
  if (!valid) {
    diagnosticCodes.push("agent_memory_policy_invalid")
    return invalidMemory()
  }
  return {
    retentionPolicy:
      retentionPolicy as AgentOperationalSettingsProjection["memory"]["retentionPolicy"],
    capsuleMode: capsuleMode as AgentOperationalSettingsProjection["memory"]["capsuleMode"],
    rawWindowSize,
    compactThreshold,
    writebackReviewRequired: input.writebackReviewRequired as boolean,
    lastCompactedAt,
    capsuleCount,
  }
}

function invalidPermission(): AgentOperationalSettingsProjection["permission"] {
  return {
    riskCeiling: "safe" as const,
    approvalRequiredFrom: "safe" as const,
    allowExternalNetwork: false,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPathCount: 0,
  }
}

function projectPermission(
  value: unknown,
  diagnosticCodes: string[],
): AgentOperationalSettingsProjection["permission"] {
  const input = record(value)
  const riskCeiling = input?.riskCeiling
  const approvalRequiredFrom = input?.approvalRequiredFrom
  const allowedPaths = input?.allowedPaths
  const valid =
    input !== null &&
    RISKS.has(riskCeiling as AgentOperationalRiskLevel) &&
    RISKS.has(approvalRequiredFrom as AgentOperationalRiskLevel) &&
    typeof input.allowExternalNetwork === "boolean" &&
    typeof input.allowFilesystemWrite === "boolean" &&
    typeof input.allowShellExecution === "boolean" &&
    typeof input.allowScreenControl === "boolean" &&
    Array.isArray(allowedPaths) &&
    allowedPaths.every((path) => typeof path === "string")
  if (!valid) {
    diagnosticCodes.push("agent_permission_profile_invalid")
    return invalidPermission()
  }
  return {
    riskCeiling: riskCeiling as AgentOperationalRiskLevel,
    approvalRequiredFrom: approvalRequiredFrom as AgentOperationalRiskLevel,
    allowExternalNetwork: input.allowExternalNetwork as boolean,
    allowFilesystemWrite: input.allowFilesystemWrite as boolean,
    allowShellExecution: input.allowShellExecution as boolean,
    allowScreenControl: input.allowScreenControl as boolean,
    allowedPathCount: allowedPaths.length,
  }
}

export function buildAgentOperationalSettingsProjection(
  source: AgentOperationalSettingsProjectionSource,
): AgentOperationalSettingsProjection {
  if (!AGENT_REF_PATTERN.test(source.agentRef)) throw new Error("agent_settings_public_ref_invalid")
  if (!Number.isInteger(source.profileVersion) || source.profileVersion < 0)
    throw new Error("agent_settings_revision_invalid")
  if (!STATUSES.has(source.status as AgentOperationalSettingsStatus))
    throw new Error("agent_settings_status_invalid")
  if (!Number.isFinite(source.observedAt) || source.observedAt < 0)
    throw new Error("agent_settings_observed_at_invalid")
  const diagnosticCodes: string[] = []
  return Object.freeze({
    agentRef: source.agentRef,
    status: source.status as AgentOperationalSettingsStatus,
    revision: source.profileVersion,
    model: Object.freeze(projectModel(source.modelProfile, diagnosticCodes)),
    memory: Object.freeze(projectMemory(source.memoryPolicy, diagnosticCodes)),
    permission: Object.freeze(projectPermission(source.permissionProfile, diagnosticCodes)),
    diagnosticCodes: Object.freeze([...new Set(diagnosticCodes)]) as string[],
    observedAt: source.observedAt,
  })
}
