import type {
  ExtensionLiveAuthorizationReceipt,
  ExtensionLiveSmokeSelection,
} from "../runs/extension-live-smoke-runner.js"
import { isYeonjangLiveSmokeReadOnlyMethod } from "../runs/yeonjang-live-smoke.js"
import type { YeonjangLiveSmokeSelection } from "../runs/yeonjang-live-smoke-runner.js"
import type { LiveAcceptanceExecutionSelection } from "./live-acceptance-execution-request.js"

export type LiveAcceptanceSnapshotCapability = "skill" | "mcp"
export type LiveAcceptanceSnapshotCapabilityKind = "skill" | "mcp_server"
export type LiveAcceptanceSnapshotStatus = "enabled" | "disabled" | "archived"
export type LiveAcceptanceSnapshotRisk =
  | "safe"
  | "moderate"
  | "external"
  | "sensitive"
  | "dangerous"

export interface LiveAcceptanceExtensionBindingSnapshot {
  readonly bindingId: string
  readonly agentId: string
  readonly capabilityKind: LiveAcceptanceSnapshotCapabilityKind
  readonly catalogId: string
  readonly bindingStatus: LiveAcceptanceSnapshotStatus
  readonly secretScopeId: string | null
  readonly enabledToolNamesJson: string
  readonly disabledToolNamesJson: string
}

export interface LiveAcceptanceCatalogSnapshot {
  readonly capability: LiveAcceptanceSnapshotCapability
  readonly catalogId: string
  readonly status: LiveAcceptanceSnapshotStatus
  readonly risk: LiveAcceptanceSnapshotRisk
  readonly toolNamesJson: string
}

export interface LiveAcceptanceToolMetadataSnapshot {
  readonly name: string
  readonly riskLevel: "safe" | "moderate" | "dangerous"
  readonly requiresApproval: boolean
  readonly hasSideEffect: boolean
}

export interface LiveAcceptanceYeonjangSessionSnapshot {
  readonly sessionId: string
  readonly state: string
  readonly lastSeenAt: number
  readonly endedAt: number | null
  readonly stale: boolean
}

export interface LiveAcceptanceYeonjangInstanceSnapshot {
  readonly instanceId: string
  readonly displayName: string
  readonly state:
    | "discovered"
    | "online"
    | "degraded"
    | "offline"
    | "update_required"
    | "permission_required"
  readonly trustState: "pending" | "trusted" | "revoked" | "quarantined"
  readonly scopeAccess: "allowed" | "foreign" | "unassigned"
  readonly runnableTarget: boolean
  readonly liveSessionCount: number
  readonly duplicateLiveSessionDetected: boolean
  readonly session: LiveAcceptanceYeonjangSessionSnapshot | null
}

export interface LiveAcceptanceRuntimeSnapshot {
  readonly capturedAt: number
  readonly extensions: readonly LiveAcceptanceExtensionBindingSnapshot[]
  readonly catalogs: readonly LiveAcceptanceCatalogSnapshot[]
  readonly tools: readonly LiveAcceptanceToolMetadataSnapshot[]
  readonly yeonjangInstances: readonly LiveAcceptanceYeonjangInstanceSnapshot[]
}

export type LiveAcceptanceSelectionPreflightReasonCode =
  | "live_preflight_input_invalid"
  | "live_preflight_extension_set_invalid"
  | "live_preflight_binding_missing"
  | "live_preflight_binding_ambiguous"
  | "live_preflight_binding_owner_mismatch"
  | "live_preflight_binding_kind_mismatch"
  | "live_preflight_binding_catalog_mismatch"
  | "live_preflight_binding_not_enabled"
  | "live_preflight_binding_secret_scope_missing"
  | "live_preflight_binding_tool_list_invalid"
  | "live_preflight_binding_tool_not_allowed"
  | "live_preflight_binding_tool_disabled"
  | "live_preflight_catalog_missing"
  | "live_preflight_catalog_ambiguous"
  | "live_preflight_catalog_not_enabled"
  | "live_preflight_catalog_not_safe"
  | "live_preflight_catalog_tool_list_invalid"
  | "live_preflight_catalog_tool_mismatch"
  | "live_preflight_tool_missing"
  | "live_preflight_tool_ambiguous"
  | "live_preflight_tool_not_read_only"
  | "live_preflight_yeonjang_missing"
  | "live_preflight_yeonjang_ambiguous"
  | "live_preflight_yeonjang_not_online"
  | "live_preflight_yeonjang_untrusted"
  | "live_preflight_yeonjang_scope_denied"
  | "live_preflight_yeonjang_not_runnable"
  | "live_preflight_yeonjang_duplicate"
  | "live_preflight_yeonjang_session_missing"
  | "live_preflight_yeonjang_session_mismatch"
  | "live_preflight_yeonjang_session_inactive"
  | "live_preflight_yeonjang_session_stale"

export type LiveAcceptanceSelectionPreflightResult =
  | {
      readonly status: "verified"
      readonly snapshotCapturedAt: number
      readonly extensions: readonly ExtensionLiveSmokeSelection[]
      readonly yeonjang: YeonjangLiveSmokeSelection
    }
  | {
      readonly status: "rejected"
      readonly reasonCode: LiveAcceptanceSelectionPreflightReasonCode
    }

export type LiveAcceptanceSelectionAvailabilityCapability = "skill" | "mcp" | "yeonjang"

export type LiveAcceptanceSelectionAvailability =
  | {
      readonly capability: LiveAcceptanceSelectionAvailabilityCapability
      readonly status: "ready"
    }
  | {
      readonly capability: LiveAcceptanceSelectionAvailabilityCapability
      readonly status: "unavailable"
      readonly reasonCode:
        | "live_acceptance_skill_selection_unavailable"
        | "live_acceptance_mcp_selection_unavailable"
        | "live_acceptance_yeonjang_selection_unavailable"
    }

function rejected(
  reasonCode: LiveAcceptanceSelectionPreflightReasonCode,
): LiveAcceptanceSelectionPreflightResult {
  return Object.freeze({ status: "rejected", reasonCode })
}

function exact(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256
}

function parseExactNameList(
  value: string,
  options: { allowCanonicalEmpty?: boolean } = {},
): readonly string[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === null && options.allowCanonicalEmpty) return Object.freeze([])
    if (
      !Array.isArray(parsed) ||
      parsed.some((item) => !exact(item)) ||
      new Set(parsed).size !== parsed.length
    ) {
      return null
    }
    return Object.freeze([...parsed]) as readonly string[]
  } catch {
    return null
  }
}

function oneExact<T>(items: readonly T[], predicate: (item: T) => boolean): T | null | "ambiguous" {
  const matches = items.filter(predicate)
  if (matches.length === 0) return null
  return matches.length === 1 ? (matches[0] as T) : "ambiguous"
}

function resolveExtension(input: {
  selection: LiveAcceptanceExecutionSelection["extensions"][number]
  snapshot: LiveAcceptanceRuntimeSnapshot
}): ExtensionLiveSmokeSelection | LiveAcceptanceSelectionPreflightReasonCode {
  const expectedKind = input.selection.capability === "skill" ? "skill" : "mcp_server"
  const binding = oneExact(
    input.snapshot.extensions,
    (item) => item.bindingId === input.selection.bindingId,
  )
  if (!binding) return "live_preflight_binding_missing"
  if (binding === "ambiguous") return "live_preflight_binding_ambiguous"
  if (binding.agentId !== input.selection.agentId) return "live_preflight_binding_owner_mismatch"
  if (binding.capabilityKind !== expectedKind) return "live_preflight_binding_kind_mismatch"
  if (binding.catalogId !== input.selection.catalogId) {
    return "live_preflight_binding_catalog_mismatch"
  }
  if (binding.bindingStatus !== "enabled") return "live_preflight_binding_not_enabled"
  if (input.selection.capability === "mcp" && !exact(binding.secretScopeId)) {
    return "live_preflight_binding_secret_scope_missing"
  }

  const enabledNames = parseExactNameList(binding.enabledToolNamesJson)
  const disabledNames = parseExactNameList(binding.disabledToolNamesJson, {
    allowCanonicalEmpty: true,
  })
  if (!enabledNames || !disabledNames) return "live_preflight_binding_tool_list_invalid"
  if (!enabledNames.includes(input.selection.toolName)) {
    return "live_preflight_binding_tool_not_allowed"
  }
  if (disabledNames.includes(input.selection.toolName)) {
    return "live_preflight_binding_tool_disabled"
  }

  const catalog = oneExact(
    input.snapshot.catalogs,
    (item) =>
      item.capability === input.selection.capability &&
      item.catalogId === input.selection.catalogId,
  )
  if (!catalog) return "live_preflight_catalog_missing"
  if (catalog === "ambiguous") return "live_preflight_catalog_ambiguous"
  if (catalog.status !== "enabled") return "live_preflight_catalog_not_enabled"
  if (catalog.risk !== "safe") return "live_preflight_catalog_not_safe"
  const catalogNames = parseExactNameList(catalog.toolNamesJson)
  if (!catalogNames) return "live_preflight_catalog_tool_list_invalid"
  if (!catalogNames.includes(input.selection.toolName)) {
    return "live_preflight_catalog_tool_mismatch"
  }

  const tool = oneExact(input.snapshot.tools, (item) => item.name === input.selection.toolName)
  if (!tool) return "live_preflight_tool_missing"
  if (tool === "ambiguous") return "live_preflight_tool_ambiguous"
  if (tool.riskLevel !== "safe" || tool.requiresApproval || tool.hasSideEffect) {
    return "live_preflight_tool_not_read_only"
  }

  const authorization: ExtensionLiveAuthorizationReceipt = Object.freeze({
    snapshotCapturedAt: input.snapshot.capturedAt,
    capability: input.selection.capability,
    agentId: input.selection.agentId,
    bindingId: input.selection.bindingId,
    catalogId: input.selection.catalogId,
    toolName: input.selection.toolName,
    ...(input.selection.capability === "mcp" && binding.secretScopeId
      ? { secretScopeId: binding.secretScopeId }
      : {}),
  })
  return Object.freeze({
    scenario: Object.freeze({
      id: `live-acceptance:${input.selection.capability}`,
      capability: input.selection.capability,
      expectedAgentId: input.selection.agentId,
      expectedBindingId: input.selection.bindingId,
      expectedCatalogId: input.selection.catalogId,
      expectedToolName: input.selection.toolName,
      readOnly: true,
    }),
    params: input.selection.params,
    authorization,
  })
}

function resolveYeonjang(input: {
  selection: LiveAcceptanceExecutionSelection["yeonjang"]
  snapshot: LiveAcceptanceRuntimeSnapshot
  now: number
  maxAgeMs: number
}): YeonjangLiveSmokeSelection | LiveAcceptanceSelectionPreflightReasonCode {
  const instance = oneExact(
    input.snapshot.yeonjangInstances,
    (item) => item.instanceId === input.selection.instanceId,
  )
  if (!instance) return "live_preflight_yeonjang_missing"
  if (instance === "ambiguous") return "live_preflight_yeonjang_ambiguous"
  if (instance.state !== "online") return "live_preflight_yeonjang_not_online"
  if (instance.trustState !== "trusted") return "live_preflight_yeonjang_untrusted"
  if (instance.scopeAccess !== "allowed") return "live_preflight_yeonjang_scope_denied"
  if (!instance.runnableTarget) return "live_preflight_yeonjang_not_runnable"
  if (instance.duplicateLiveSessionDetected || instance.liveSessionCount !== 1) {
    return "live_preflight_yeonjang_duplicate"
  }
  if (!instance.session) return "live_preflight_yeonjang_session_missing"
  if (instance.session.sessionId !== input.selection.sessionId) {
    return "live_preflight_yeonjang_session_mismatch"
  }
  if (
    instance.session.endedAt !== null ||
    ["offline", "disconnected", "duplicate_instance_conflict", "session_replaced"].includes(
      instance.session.state.trim().toLowerCase(),
    )
  ) {
    return "live_preflight_yeonjang_session_inactive"
  }
  if (
    instance.session.stale ||
    instance.session.lastSeenAt > input.now ||
    input.now - instance.session.lastSeenAt > input.maxAgeMs
  ) {
    return "live_preflight_yeonjang_session_stale"
  }

  return Object.freeze({
    scenario: Object.freeze({
      id: `live-acceptance:yeonjang-${input.selection.method.replaceAll(".", "-")}`,
      expectedInstanceId: input.selection.instanceId,
      expectedSessionId: input.selection.sessionId,
      expectedMethod: input.selection.method,
      ...(input.selection.params ? { params: input.selection.params } : {}),
      readOnly: true,
    }),
    instance: Object.freeze({
      instanceId: instance.instanceId,
      publicName: instance.displayName,
      sessionId: instance.session.sessionId,
      status: "connected",
      observedAt: instance.session.lastSeenAt,
      duplicateActiveIdentityCount: 0,
      trustState: "trusted",
      runnableTarget: true,
    }),
  })
}

function unavailableSelection(
  capability: LiveAcceptanceSelectionAvailabilityCapability,
): LiveAcceptanceSelectionAvailability {
  const reasonCode =
    capability === "skill"
      ? "live_acceptance_skill_selection_unavailable"
      : capability === "mcp"
        ? "live_acceptance_mcp_selection_unavailable"
        : "live_acceptance_yeonjang_selection_unavailable"
  return Object.freeze({ capability, status: "unavailable", reasonCode })
}

function extensionSelectionAvailable(input: {
  readonly capability: LiveAcceptanceSnapshotCapability
  readonly snapshot: LiveAcceptanceRuntimeSnapshot
}): boolean {
  const expectedKind = input.capability === "skill" ? "skill" : "mcp_server"
  for (const binding of input.snapshot.extensions) {
    if (binding.capabilityKind !== expectedKind) continue
    const enabledNames = parseExactNameList(binding.enabledToolNamesJson)
    if (!enabledNames) continue
    for (const toolName of enabledNames) {
      const resolved = resolveExtension({
        selection: Object.freeze({
          capability: input.capability,
          agentId: binding.agentId,
          bindingId: binding.bindingId,
          catalogId: binding.catalogId,
          toolName,
          readOnly: true,
          params: Object.freeze({}),
        }),
        snapshot: input.snapshot,
      })
      if (typeof resolved !== "string") return true
    }
  }
  return false
}

function yeonjangSelectionAvailable(input: {
  readonly snapshot: LiveAcceptanceRuntimeSnapshot
  readonly now: number
  readonly maxAgeMs: number
}): boolean {
  for (const instance of input.snapshot.yeonjangInstances) {
    if (!instance.session) continue
    const resolved = resolveYeonjang({
      selection: Object.freeze({
        instanceId: instance.instanceId,
        sessionId: instance.session.sessionId,
        method: "system.info",
        readOnly: true,
      }),
      snapshot: input.snapshot,
      now: input.now,
      maxAgeMs: input.maxAgeMs,
    })
    if (typeof resolved !== "string") return true
  }
  return false
}

export function inspectLiveAcceptanceSelectionAvailability(input: {
  readonly snapshot: LiveAcceptanceRuntimeSnapshot
  readonly now: number
  readonly maxYeonjangAgeMs: number
}): readonly LiveAcceptanceSelectionAvailability[] {
  const inputValid =
    Number.isSafeInteger(input.now) &&
    Number.isSafeInteger(input.snapshot.capturedAt) &&
    input.snapshot.capturedAt <= input.now &&
    Number.isSafeInteger(input.maxYeonjangAgeMs) &&
    input.maxYeonjangAgeMs > 0
  const skillReady =
    inputValid && extensionSelectionAvailable({ capability: "skill", snapshot: input.snapshot })
  const mcpReady =
    inputValid && extensionSelectionAvailable({ capability: "mcp", snapshot: input.snapshot })
  const yeonjangReady =
    inputValid &&
    yeonjangSelectionAvailable({
      snapshot: input.snapshot,
      now: input.now,
      maxAgeMs: input.maxYeonjangAgeMs,
    })
  return Object.freeze([
    skillReady
      ? Object.freeze({ capability: "skill" as const, status: "ready" as const })
      : unavailableSelection("skill"),
    mcpReady
      ? Object.freeze({ capability: "mcp" as const, status: "ready" as const })
      : unavailableSelection("mcp"),
    yeonjangReady
      ? Object.freeze({ capability: "yeonjang" as const, status: "ready" as const })
      : unavailableSelection("yeonjang"),
  ])
}

export function resolveLiveAcceptanceExecutionSelections(input: {
  readonly selection: LiveAcceptanceExecutionSelection
  readonly snapshot: LiveAcceptanceRuntimeSnapshot
  readonly now: number
  readonly maxYeonjangAgeMs: number
}): LiveAcceptanceSelectionPreflightResult {
  if (
    !input.selection ||
    !Array.isArray(input.selection.extensions) ||
    !input.selection.yeonjang ||
    !Number.isSafeInteger(input.now) ||
    !Number.isSafeInteger(input.snapshot.capturedAt) ||
    input.snapshot.capturedAt > input.now ||
    !Number.isSafeInteger(input.maxYeonjangAgeMs) ||
    input.maxYeonjangAgeMs <= 0
  ) {
    return rejected("live_preflight_input_invalid")
  }
  const capabilities = input.selection.extensions.map((item) => item.capability)
  if (
    input.selection.extensions.length !== 2 ||
    new Set(capabilities).size !== 2 ||
    !capabilities.includes("skill") ||
    !capabilities.includes("mcp") ||
    input.selection.extensions.some(
      (item) =>
        item.readOnly !== true ||
        !exact(item.agentId) ||
        !exact(item.bindingId) ||
        !exact(item.catalogId) ||
        !exact(item.toolName),
    ) ||
    input.selection.yeonjang.readOnly !== true ||
    !isYeonjangLiveSmokeReadOnlyMethod(input.selection.yeonjang.method) ||
    !exact(input.selection.yeonjang.instanceId) ||
    !exact(input.selection.yeonjang.sessionId)
  ) {
    return rejected("live_preflight_extension_set_invalid")
  }

  const extensions: ExtensionLiveSmokeSelection[] = []
  for (const selection of input.selection.extensions) {
    const resolved = resolveExtension({ selection, snapshot: input.snapshot })
    if (typeof resolved === "string") return rejected(resolved)
    extensions.push(resolved)
  }
  const yeonjang = resolveYeonjang({
    selection: input.selection.yeonjang,
    snapshot: input.snapshot,
    now: input.now,
    maxAgeMs: input.maxYeonjangAgeMs,
  })
  if (typeof yeonjang === "string") return rejected(yeonjang)

  return Object.freeze({
    status: "verified",
    snapshotCapturedAt: input.snapshot.capturedAt,
    extensions: Object.freeze(extensions),
    yeonjang,
  })
}
