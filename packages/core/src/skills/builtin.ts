import {
  listAgentCapabilityBindings,
  upsertAgentCapabilityBinding,
  upsertSkillCatalogEntry,
} from "../db/index.js"
import type { PermissionProfile } from "../contracts/sub-agent-orchestration.js"

export const YEONJANG_SKILL_ID = "skill:yeonjang"
export const WEB_RESEARCH_SKILL_ID = "skill:web-research"
export const WEB_RESEARCH_SKILL_TOOL_NAMES = ["web_search", "web_fetch"] as const
export const YEONJANG_CAMERA_RUNTIME_TOOL_NAMES = [
  "yeonjang_status",
  "yeonjang_camera_list",
  "yeonjang_camera_capture",
  "yeonjang_camera_permission_status",
] as const

export const YEONJANG_SKILL_TOOL_NAMES = [
  "yeonjang_status",
  "yeonjang_broadcast_run",
  "yeonjang_camera_list",
  "yeonjang_camera_capture",
  "yeonjang_camera_permission_status",
  "yeonjang_file_metadata",
  "yeonjang_file_list",
  "yeonjang_file_read",
  "yeonjang_file_search",
  "yeonjang_file_write",
  "yeonjang_file_patch",
  "yeonjang_file_delete",
  "yeonjang_disk_info",
  "yeonjang_disk_usage",
  "yeonjang_disk_exists",
  "yeonjang_process_list",
  "yeonjang_process_info",
  "yeonjang_browser_list",
  "yeonjang_browser_active_hint",
  "yeonjang_browser_open_url",
  "yeonjang_browser_focus",
  "yeonjang_clipboard_read",
  "yeonjang_clipboard_write",
  "yeonjang_network_status",
  "yeonjang_device_status",
  "shell_exec",
  "app_launch",
  "screen_capture",
  "screen_find_text",
  "mouse_move",
  "mouse_click",
  "mouse_action",
  "keyboard_type",
  "keyboard_shortcut",
  "keyboard_action",
] as const

export interface RegisterBuiltinSkillsOptions {
  mainAgentId?: string
  now?: number
}

const DEFAULT_MAIN_AGENT_ID = "agent:knowbee"

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  } catch {
    return []
  }
}

function parseRecord(value: string | null | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function yeonjangCameraPermissionProfile(agentId: string): PermissionProfile {
  return {
    profileId: `permission:${agentId}:yeonjang-camera`,
    riskCeiling: "moderate",
    approvalRequiredFrom: "moderate",
    allowExternalNetwork: false,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPaths: [],
  }
}

function backfillYeonjangCameraBindings(now: number): void {
  for (const binding of listAgentCapabilityBindings({
    capabilityKind: "yeonjang",
    includeArchived: true,
  })) {
    if (binding.status !== "enabled" || binding.permission_profile_json) continue
    const enabledToolNames = parseStringArray(binding.enabled_tool_names_json)
    upsertAgentCapabilityBinding({
      bindingId: binding.binding_id,
      agentId: binding.agent_id,
      capabilityKind: "yeonjang",
      catalogId: binding.catalog_id,
      status: binding.status,
      ...(binding.secret_scope_id ? { secretScopeId: binding.secret_scope_id } : {}),
      enabledToolNames: enabledToolNames.length > 0
        ? enabledToolNames
        : [...YEONJANG_CAMERA_RUNTIME_TOOL_NAMES],
      disabledToolNames: parseStringArray(binding.disabled_tool_names_json),
      permissionProfile: yeonjangCameraPermissionProfile(binding.agent_id),
      ...(parseRecord(binding.rate_limit_json) ? { rateLimit: parseRecord(binding.rate_limit_json) as never } : {}),
      approvalRequiredFrom: binding.approval_required_from ?? "moderate",
      createdAt: binding.created_at,
      updatedAt: now,
    }, { source: binding.source ?? "system", auditId: binding.audit_id ?? null, now })
  }
}

function ensureMainSkillBinding(input: {
  mainAgentId: string
  skillId: string
  toolNames: readonly string[]
  approvalRequiredFrom: "safe" | "moderate"
  now: number
}): void {
  const existingBinding = listAgentCapabilityBindings({
    agentId: input.mainAgentId,
    capabilityKind: "skill",
    includeArchived: true,
  }).find((binding) => binding.catalog_id === input.skillId)
  if (existingBinding) return

  upsertAgentCapabilityBinding({
    bindingId: `binding:${input.mainAgentId}:${input.skillId}`,
    agentId: input.mainAgentId,
    capabilityKind: "skill",
    catalogId: input.skillId,
    status: "enabled",
    enabledToolNames: [...input.toolNames],
    disabledToolNames: [],
    approvalRequiredFrom: input.approvalRequiredFrom,
    createdAt: input.now,
    updatedAt: input.now,
  }, { source: "system", now: input.now })
}

export function registerBuiltinSkills(options: RegisterBuiltinSkillsOptions = {}): void {
  const now = options.now ?? Date.now()
  const mainAgentId = options.mainAgentId?.trim() || DEFAULT_MAIN_AGENT_ID
  upsertSkillCatalogEntry({
    skillId: YEONJANG_SKILL_ID,
    displayName: "Yeonjang computer control",
    status: "enabled",
    risk: "moderate",
    toolNames: [...YEONJANG_SKILL_TOOL_NAMES],
    metadata: {
      builtin: true,
      capability: "computer_control",
      promptSourceId: "yeonjang_policy",
    },
    createdAt: now,
    updatedAt: now,
  }, { source: "system", now })
  upsertSkillCatalogEntry({
    skillId: WEB_RESEARCH_SKILL_ID,
    displayName: "Web research",
    status: "enabled",
    risk: "safe",
    toolNames: [...WEB_RESEARCH_SKILL_TOOL_NAMES],
    metadata: {
      builtin: true,
      capability: "web_research",
      promptSourceId: "web_access_policy_runtime",
    },
    createdAt: now,
    updatedAt: now,
  }, { source: "system", now })
  backfillYeonjangCameraBindings(now)

  ensureMainSkillBinding({
    mainAgentId,
    skillId: YEONJANG_SKILL_ID,
    toolNames: YEONJANG_SKILL_TOOL_NAMES,
    approvalRequiredFrom: "moderate",
    now,
  })
  ensureMainSkillBinding({
    mainAgentId,
    skillId: WEB_RESEARCH_SKILL_ID,
    toolNames: WEB_RESEARCH_SKILL_TOOL_NAMES,
    approvalRequiredFrom: "safe",
    now,
  })
}
