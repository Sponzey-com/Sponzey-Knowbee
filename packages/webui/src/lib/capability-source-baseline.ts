export type CapabilityRevisionState = "present" | "missing" | "not_applicable"
export type CapabilityRuntimeApplyMode = "command" | "direct_adapter_mutation" | "none"

export interface CapabilityOwnerInventory {
  aggregateId: "skill_catalog" | "mcp_catalog" | "agent_binding" | "yeonjang_runtime"
  draftOwner: string | null
  persistedOwners: readonly string[]
  writeOwners: readonly string[]
  runtimeOwner: string
  persistedRevision: CapabilityRevisionState
  runtimeRevision: CapabilityRevisionState
  runtimeApplyMode: CapabilityRuntimeApplyMode
  legacyGapReasonCodes: readonly string[]
}

export type CapabilityOwnershipDiagnostic =
  | { aggregateId: string; reasonCode: "write_owner_missing" }
  | { aggregateId: string; reasonCode: "write_owner_duplicated"; owners: readonly string[] }
  | { aggregateId: string; reasonCode: "persisted_revision_missing" }
  | { aggregateId: string; reasonCode: "runtime_revision_missing" }
  | { aggregateId: string; reasonCode: "runtime_use_case_bypassed" }

export const CURRENT_CAPABILITY_OWNER_BASELINE: readonly CapabilityOwnerInventory[] = [
  {
    aggregateId: "skill_catalog",
    draftOwner: "setup.draft.skills",
    persistedOwners: ["config.file.skills", "capability_db.skill_catalog"],
    writeOwners: ["setup.save", "builtin_skill.catalog_upsert"],
    runtimeOwner: "skill.runtime_loader",
    persistedRevision: "missing",
    runtimeRevision: "missing",
    runtimeApplyMode: "command",
    legacyGapReasonCodes: ["catalog_projection_not_authoritative", "revision_not_persisted"],
  },
  {
    aggregateId: "mcp_catalog",
    draftOwner: "setup.draft.mcp",
    persistedOwners: ["config.file.mcp"],
    writeOwners: ["setup.save"],
    runtimeOwner: "mcp.registry",
    persistedRevision: "missing",
    runtimeRevision: "missing",
    runtimeApplyMode: "direct_adapter_mutation",
    legacyGapReasonCodes: ["catalog_repository_not_connected", "runtime_reload_precedes_receipt"],
  },
  {
    aggregateId: "agent_binding",
    draftOwner: "setup.draft.subagents",
    persistedOwners: ["config.file.subagents", "capability_db.agent_binding"],
    writeOwners: ["setup.save", "builtin_skill.binding_upsert"],
    runtimeOwner: "delegation.runtime_router",
    persistedRevision: "missing",
    runtimeRevision: "missing",
    runtimeApplyMode: "command",
    legacyGapReasonCodes: ["binding_projection_not_authoritative", "revision_not_persisted"],
  },
  {
    aggregateId: "yeonjang_runtime",
    draftOwner: null,
    persistedOwners: ["capability_db.skill_catalog", "capability_db.agent_binding"],
    writeOwners: ["builtin_skill.register"],
    runtimeOwner: "yeonjang.registry",
    persistedRevision: "missing",
    runtimeRevision: "missing",
    runtimeApplyMode: "command",
    legacyGapReasonCodes: ["runtime_and_catalog_revision_not_correlated"],
  },
] as const

export function validateCapabilityOwnership(
  inventory: readonly CapabilityOwnerInventory[],
): { ok: boolean; diagnostics: CapabilityOwnershipDiagnostic[] } {
  const diagnostics: CapabilityOwnershipDiagnostic[] = []
  for (const item of inventory) {
    if (item.writeOwners.length === 0) {
      diagnostics.push({ aggregateId: item.aggregateId, reasonCode: "write_owner_missing" })
    } else if (item.writeOwners.length > 1) {
      diagnostics.push({
        aggregateId: item.aggregateId,
        reasonCode: "write_owner_duplicated",
        owners: [...item.writeOwners],
      })
    }
    if (item.persistedRevision === "missing") {
      diagnostics.push({ aggregateId: item.aggregateId, reasonCode: "persisted_revision_missing" })
    }
    if (item.runtimeRevision === "missing") {
      diagnostics.push({ aggregateId: item.aggregateId, reasonCode: "runtime_revision_missing" })
    }
    if (item.runtimeApplyMode === "direct_adapter_mutation") {
      diagnostics.push({ aggregateId: item.aggregateId, reasonCode: "runtime_use_case_bypassed" })
    }
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

export type CapabilityMigrationCheckpointId =
  | "shadow_read"
  | "single_write_owner"
  | "revision_compare"
  | "cutover"
  | "legacy_write_blocked"
  | "rollback_verified"

export interface CapabilityMigrationCheckpoint {
  checkpointId: CapabilityMigrationCheckpointId
  owner: string
  evidence: string
}

export const CAPABILITY_MIGRATION_CHECKPOINTS: readonly CapabilityMigrationCheckpoint[] = [
  { checkpointId: "shadow_read", owner: "capability.query", evidence: "old_new_projection_diff" },
  { checkpointId: "single_write_owner", owner: "capability.command", evidence: "writer_inventory" },
  { checkpointId: "revision_compare", owner: "capability.query", evidence: "persisted_runtime_revision_match" },
  { checkpointId: "cutover", owner: "capability.application", evidence: "new_projection_served" },
  { checkpointId: "legacy_write_blocked", owner: "capability.boundary", evidence: "legacy_write_rejected" },
  { checkpointId: "rollback_verified", owner: "capability.application", evidence: "rollback_rehearsal_receipt" },
] as const

export type CapabilityMigrationDiagnostic =
  | { checkpointId: CapabilityMigrationCheckpointId; reasonCode: "migration_checkpoint_missing" }
  | { checkpointId: CapabilityMigrationCheckpointId; reasonCode: "migration_checkpoint_owner_missing" }
  | { reasonCode: "migration_checkpoint_order_invalid" }

export function validateCapabilityMigration(
  checkpoints: readonly CapabilityMigrationCheckpoint[],
): { ok: boolean; diagnostics: CapabilityMigrationDiagnostic[] } {
  const diagnostics: CapabilityMigrationDiagnostic[] = []
  const expectedOrder = CAPABILITY_MIGRATION_CHECKPOINTS.map((item) => item.checkpointId)
  for (const checkpointId of expectedOrder) {
    const checkpoint = checkpoints.find((item) => item.checkpointId === checkpointId)
    if (!checkpoint) {
      diagnostics.push({ checkpointId, reasonCode: "migration_checkpoint_missing" })
    } else if (checkpoint.owner.trim().length === 0) {
      diagnostics.push({ checkpointId, reasonCode: "migration_checkpoint_owner_missing" })
    }
  }
  const actualKnownOrder = checkpoints
    .map((item) => item.checkpointId)
    .filter((id) => expectedOrder.includes(id))
  const sortedKnownOrder = [...actualKnownOrder].sort(
    (left, right) => expectedOrder.indexOf(left) - expectedOrder.indexOf(right),
  )
  if (actualKnownOrder.some((id, index) => id !== sortedKnownOrder[index])) {
    diagnostics.push({ reasonCode: "migration_checkpoint_order_invalid" })
  } else if (checkpoints.length !== expectedOrder.length) {
    diagnostics.push({ reasonCode: "migration_checkpoint_order_invalid" })
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

export const SUPPORTED_DESKTOP_PLATFORMS = ["macos", "windows", "linux"] as const
export type DesktopPlatform = typeof SUPPORTED_DESKTOP_PLATFORMS[number]

export const REQUIRED_PLATFORM_CAPABILITY_IDS = [
  "yeonjang_transport",
  "shell_exec",
  "filesystem_read_write",
  "app_launch",
  "screen_capture",
  "keyboard_control",
  "mouse_control",
] as const
export type PlatformCapabilityId = typeof REQUIRED_PLATFORM_CAPABILITY_IDS[number]
export type PlatformCapabilityStatus = "supported" | "permission_required" | "unsupported" | "unknown"

export interface PlatformCapabilityProjection {
  capabilityId: PlatformCapabilityId
  platform: DesktopPlatform
  status: PlatformCapabilityStatus
  userFacingReasonCode: string
}

function forEveryPlatform(
  capabilityId: PlatformCapabilityId,
  status: PlatformCapabilityStatus,
  userFacingReasonCode: string,
): PlatformCapabilityProjection[] {
  return SUPPORTED_DESKTOP_PLATFORMS.map((platform) => ({
    capabilityId,
    platform,
    status,
    userFacingReasonCode,
  }))
}

export const CURRENT_PLATFORM_CAPABILITY_MATRIX: readonly PlatformCapabilityProjection[] = [
  ...forEveryPlatform("yeonjang_transport", "supported", "yeonjang_runtime_connection_required"),
  ...forEveryPlatform("shell_exec", "supported", "yeonjang_runtime_connection_required"),
  ...forEveryPlatform("filesystem_read_write", "supported", "filesystem_permission_required"),
  ...forEveryPlatform("app_launch", "permission_required", "desktop_session_and_app_required"),
  ...forEveryPlatform("screen_capture", "permission_required", "screen_capture_permission_or_helper_required"),
  ...forEveryPlatform("keyboard_control", "permission_required", "input_control_permission_or_helper_required"),
  ...forEveryPlatform("mouse_control", "permission_required", "input_control_permission_or_helper_required"),
] as const

export type PlatformCapabilityDiagnostic = {
  capabilityId: PlatformCapabilityId
  platform: DesktopPlatform
  reasonCode: "platform_state_missing" | "platform_state_duplicated" | "platform_state_unknown" | "platform_reason_missing"
}

export function validatePlatformCapabilityMatrix(
  matrix: readonly PlatformCapabilityProjection[],
): { ok: boolean; diagnostics: PlatformCapabilityDiagnostic[] } {
  const diagnostics: PlatformCapabilityDiagnostic[] = []
  for (const capabilityId of REQUIRED_PLATFORM_CAPABILITY_IDS) {
    for (const platform of SUPPORTED_DESKTOP_PLATFORMS) {
      const matches = matrix.filter(
        (item) => item.capabilityId === capabilityId && item.platform === platform,
      )
      if (matches.length === 0) {
        diagnostics.push({ capabilityId, platform, reasonCode: "platform_state_missing" })
        continue
      }
      if (matches.length > 1) {
        diagnostics.push({ capabilityId, platform, reasonCode: "platform_state_duplicated" })
      }
      const item = matches[0]
      if (item.status === "unknown") {
        diagnostics.push({ capabilityId, platform, reasonCode: "platform_state_unknown" })
      }
      if (item.userFacingReasonCode.trim().length === 0) {
        diagnostics.push({ capabilityId, platform, reasonCode: "platform_reason_missing" })
      }
    }
  }
  return { ok: diagnostics.length === 0, diagnostics }
}
