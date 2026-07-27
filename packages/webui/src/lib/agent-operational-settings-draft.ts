import type {
  AgentOperationalSettingsMutationKind,
  AgentOperationalSettingsMutationRequest,
  AgentOperationalSettingsProjection,
} from "../contracts/agents"

export type AgentOperationalSettingsSection = "ai" | "memory" | "permissions"
type RiskLevel = AgentOperationalSettingsProjection["permission"]["riskCeiling"]

export interface AgentOperationalSettingsDraft {
  agentRef: string
  revision: number
  model: {
    configured: boolean
    providerName: string
    modelName: string
    effort: string
    fallbackModelName: string
  }
  memory: {
    retentionPolicy: AgentOperationalSettingsProjection["memory"]["retentionPolicy"]
    capsuleMode: AgentOperationalSettingsProjection["memory"]["capsuleMode"]
    rawWindowSize: number
    compactThreshold: number
    writebackReviewRequired: boolean
  }
  permission: Omit<AgentOperationalSettingsProjection["permission"], "allowedPathCount">
}

const RISK_ORDER: Record<RiskLevel, number> = {
  safe: 0,
  moderate: 1,
  external: 2,
  sensitive: 3,
  dangerous: 4,
}

export function createAgentOperationalSettingsDraft(
  projection: AgentOperationalSettingsProjection,
): AgentOperationalSettingsDraft {
  return {
    agentRef: projection.agentRef,
    revision: projection.revision,
    model: {
      configured: projection.model.configured,
      providerName: projection.model.providerName ?? "",
      modelName: projection.model.modelName ?? "",
      effort: projection.model.effort ?? "",
      fallbackModelName: projection.model.fallbackModelName ?? "",
    },
    memory: {
      retentionPolicy: projection.memory.retentionPolicy,
      capsuleMode: projection.memory.capsuleMode,
      rawWindowSize: projection.memory.rawWindowSize ?? 20,
      compactThreshold: projection.memory.compactThreshold ?? 40,
      writebackReviewRequired: projection.memory.writebackReviewRequired,
    },
    permission: {
      riskCeiling: projection.permission.riskCeiling,
      approvalRequiredFrom: projection.permission.approvalRequiredFrom,
      allowExternalNetwork: projection.permission.allowExternalNetwork,
      allowFilesystemWrite: projection.permission.allowFilesystemWrite,
      allowShellExecution: projection.permission.allowShellExecution,
      allowScreenControl: projection.permission.allowScreenControl,
    },
  }
}

export function operationalSettingsSectionDirty(
  section: AgentOperationalSettingsSection,
  draft: AgentOperationalSettingsDraft,
  projection: AgentOperationalSettingsProjection,
): boolean {
  const baseline = createAgentOperationalSettingsDraft(projection)
  const key = section === "ai" ? "model" : section === "permissions" ? "permission" : "memory"
  return JSON.stringify(draft[key]) !== JSON.stringify(baseline[key])
}

export function validateOperationalSettingsDraft(
  section: AgentOperationalSettingsSection,
  draft: AgentOperationalSettingsDraft,
): string | null {
  if (section === "ai" && draft.model.configured) {
    if (!draft.model.providerName.trim()) return "model_provider_required"
    if (!draft.model.modelName.trim()) return "model_name_required"
  }
  if (section === "memory") {
    if (!Number.isInteger(draft.memory.rawWindowSize) || draft.memory.rawWindowSize < 1)
      return "memory_raw_window_invalid"
    if (
      !Number.isInteger(draft.memory.compactThreshold) ||
      draft.memory.compactThreshold <= draft.memory.rawWindowSize
    )
      return "memory_compact_threshold_invalid"
  }
  return null
}

export function operationalPermissionElevation(
  draft: AgentOperationalSettingsDraft,
  projection: AgentOperationalSettingsProjection,
): boolean {
  const current = projection.permission
  const next = draft.permission
  return (
    RISK_ORDER[next.riskCeiling] > RISK_ORDER[current.riskCeiling] ||
    RISK_ORDER[next.approvalRequiredFrom] > RISK_ORDER[current.approvalRequiredFrom] ||
    (!current.allowExternalNetwork && next.allowExternalNetwork) ||
    (!current.allowFilesystemWrite && next.allowFilesystemWrite) ||
    (!current.allowShellExecution && next.allowShellExecution) ||
    (!current.allowScreenControl && next.allowScreenControl)
  )
}

export function buildOperationalSettingsMutationRequest(input: {
  section: AgentOperationalSettingsSection
  draft: AgentOperationalSettingsDraft
  confirmElevation?: boolean
}): AgentOperationalSettingsMutationRequest {
  const targetRevision = input.draft.revision + 1
  if (input.section === "ai") {
    if (!input.draft.model.configured) return { kind: "clear_model", targetRevision }
    return {
      kind: "update_model",
      targetRevision,
      value: {
        providerName: input.draft.model.providerName.trim(),
        modelName: input.draft.model.modelName.trim(),
        ...(input.draft.model.effort.trim() ? { effort: input.draft.model.effort.trim() } : {}),
        ...(input.draft.model.fallbackModelName.trim()
          ? { fallbackModelName: input.draft.model.fallbackModelName.trim() }
          : {}),
      },
    }
  }
  if (input.section === "memory")
    return { kind: "update_memory", targetRevision, value: { ...input.draft.memory } }
  return {
    kind: "update_permission",
    targetRevision,
    value: { ...input.draft.permission },
    ...(input.confirmElevation ? { confirmElevation: true } : {}),
  }
}

export function operationalSettingsErrorMessage(
  error: unknown,
  text: (ko: string, en: string) => string,
): string {
  const source = error instanceof Error ? error.message : String(error)
  if (source.includes("mutation_revision_conflict"))
    return text(
      "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 확인해 주세요.",
      "Another change was saved first. Refresh and review your draft.",
    )
  if (source.includes("mutation_scope_denied"))
    return text("권한 확대 확인이 필요합니다.", "Confirm the permission expansion before saving.")
  if (source.includes("agent_settings_inactive"))
    return text(
      "비활성 또는 보관된 에이전트는 수정할 수 없습니다.",
      "Inactive or archived agents cannot be edited.",
    )
  if (source.includes("agent_settings_unchanged"))
    return text("변경된 값이 없습니다.", "There are no changes to save.")
  if (source.includes("invalid"))
    return text("입력값을 확인해 주세요.", "Review the entered values.")
  return text(
    "설정을 저장하지 못했습니다. 현재 값을 새로고침한 뒤 다시 시도해 주세요.",
    "Could not save settings. Refresh the current values and try again.",
  )
}

export function mutationKindForSection(
  section: AgentOperationalSettingsSection,
  draft: AgentOperationalSettingsDraft,
): AgentOperationalSettingsMutationKind {
  if (section === "ai") return draft.model.configured ? "update_model" : "clear_model"
  return section === "memory" ? "update_memory" : "update_permission"
}
