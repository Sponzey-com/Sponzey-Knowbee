export type YeonjangCapabilityStatus =
  | "ready"
  | "unavailable"
  | "inactive"
  | "permission_required"
  | "stale"

export type YeonjangCapabilityPlatform = "linux" | "windows" | "macos" | "unknown"

export type YeonjangCapabilityGroup =
  | "applications"
  | "browser"
  | "disk"
  | "files"
  | "input"
  | "process"
  | "screen"
  | "system"

export interface YeonjangCapabilityItem {
  yeonjangRef: string
  displayName: string
  location: "local" | "remote"
  platform: YeonjangCapabilityPlatform
  supportProfile: "desktop_interactive" | "desktop_limited" | "headless_managed"
  status: YeonjangCapabilityStatus
  permissionState: "ready" | "required" | "restricted" | "unknown"
  lastSeenAt: number | null
  lastSeenAgeMs: number | null
  stale: boolean
  runnable: boolean
  capabilityGroups: YeonjangCapabilityGroup[]
  actionableIssue:
    | "yeonjang_duplicate_instance"
    | "yeonjang_stale"
    | "yeonjang_permission_required"
    | "yeonjang_update_required"
    | "yeonjang_unavailable"
    | "yeonjang_restricted"
    | null
}

export interface YeonjangCapabilitySummary {
  total: number
  ready: number
  local: number
  remote: number
  permissionRequired: number
  stale: number
  duplicateInstanceDetected: boolean
  knowbeeFallbackAvailable: true
  computerControlAvailable: boolean
}

export interface YeonjangCapabilityPage {
  items: YeonjangCapabilityItem[]
  nextCursor: string | null
  cursorValid: boolean
  totalMatches: number
  summary: YeonjangCapabilitySummary
  observedAt: number
  revision: number
}

export interface YeonjangCapabilityQueryInput {
  limit?: number
  cursor?: string
  search?: string
  location?: YeonjangCapabilityItem["location"]
  platform?: YeonjangCapabilityPlatform
  status?: YeonjangCapabilityStatus
}

export interface YeonjangAgentProjection {
  agentRef: string
  name: string
}

export type YeonjangPlatformSupportStatus =
  | "supported"
  | "limited"
  | "unsupported"
  | "permission_required"

export interface YeonjangPlatformSupportItem {
  status: YeonjangPlatformSupportStatus
  reasonCodes: readonly string[]
}

export interface YeonjangPlatformSupportProjection {
  platform: YeonjangCapabilityPlatform
  supportProfile: YeonjangCapabilityItem["supportProfile"]
  capabilities: Record<YeonjangCapabilityGroup, YeonjangPlatformSupportItem>
  processControl: YeonjangPlatformSupportItem
  trayWindow: YeonjangPlatformSupportItem
  packageSmoke: YeonjangPlatformSupportItem
  runnableCapabilityGroups: readonly YeonjangCapabilityGroup[]
}

export interface YeonjangCapabilityDetail extends YeonjangCapabilityItem {
  revision: number
  platformSupport?: YeonjangPlatformSupportProjection
  bindings: {
    boundAgents: YeonjangAgentProjection[]
    availableAgents: YeonjangAgentProjection[]
  }
}

export interface YeonjangMutationEnvelope {
  scope: "capability:write"
  mutationId: string
  targetRevision: number
  purpose: "yeonjang_reconnect" | "yeonjang_check_permissions" | "yeonjang_bind" | "yeonjang_unbind"
  issuedAt: number
  nonce: string
}

export interface YeonjangRecoveryRequest {
  envelope: YeonjangMutationEnvelope
  action: "reconnect" | "check_permissions"
}

export interface YeonjangRecoveryReceipt {
  mutationId: string
  state: "active" | "failed" | "rolled_back" | "cancelled" | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  yeonjangRef: string
  action: YeonjangRecoveryRequest["action"]
  ready: boolean
}

export interface YeonjangBindingRequest {
  envelope: YeonjangMutationEnvelope
  bound: boolean
}

export interface YeonjangBindingReceipt {
  mutationId: string
  state: "active" | "failed" | "rolled_back" | "cancelled" | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  yeonjangRef: string
  agentRef: string
  bound: boolean
}

export type YeonjangBrowserActiveTabInfoReadinessAudience = "general" | "advanced"

export type YeonjangBrowserActiveTabInfoReadinessStatus =
  | "ready"
  | "permission_required"
  | "observation_backend_required"
  | "headless_unavailable"
  | "unsupported"
  | "unknown"

export type YeonjangBrowserActiveTabInfoReadinessUserAction =
  | "ready_to_request_active_tab_approval"
  | "enable_browser_read_permission"
  | "update_or_reinstall_yeonjang"
  | "start_interactive_desktop_session"
  | "install_supported_yeonjang"
  | "select_supported_platform"

export type YeonjangBrowserActiveTabInfoBackendFamily =
  | "accessibility_api"
  | "browser_extension_bridge"
  | "windows_ui_automation"
  | "linux_accessibility_api"
  | "wayland_portal"

export interface YeonjangBrowserActiveTabInfoPublicReadinessTarget {
  publicTargetName: string
  platform: YeonjangCapabilityPlatform
  readinessStatus: YeonjangBrowserActiveTabInfoReadinessStatus
  statusLabel: string
  userAction: YeonjangBrowserActiveTabInfoReadinessUserAction
  actionLabel: string
  reasonLabel: string
  advancedDiagnostic?: {
    candidateBackendFamilies: YeonjangBrowserActiveTabInfoBackendFamily[]
  }
}

export interface YeonjangBrowserActiveTabInfoPublicReadinessSummary {
  schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1"
  method: "browser.active_tab_info"
  audience: YeonjangBrowserActiveTabInfoReadinessAudience
  readyCount: number
  blockedCount: number
  targets: YeonjangBrowserActiveTabInfoPublicReadinessTarget[]
}

export type YeonjangBrowserActiveTabInfoPreDispatchPreview =
  | {
      status: "blocked"
      reasonCode: string
      method: "browser.active_tab_info"
      toolName: "yeonjang_browser_active_tab_info"
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }
  | {
      status: "prepared"
      reasonCode: "active_tab_info_pre_dispatch_prepared"
      method: "browser.active_tab_info"
      toolName: "yeonjang_browser_active_tab_info"
      publicTargetName: string
      platform: YeonjangCapabilityPlatform
      observationStatus: "available" | "permission_required" | "unsupported" | "headless_unavailable" | "unknown"
      browserName: string
      requiredGateCount: number
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }

const activeTabInfoStatusValues = new Set<YeonjangBrowserActiveTabInfoReadinessStatus>([
  "ready",
  "permission_required",
  "observation_backend_required",
  "headless_unavailable",
  "unsupported",
  "unknown",
])

const activeTabInfoActionValues = new Set<YeonjangBrowserActiveTabInfoReadinessUserAction>([
  "ready_to_request_active_tab_approval",
  "enable_browser_read_permission",
  "update_or_reinstall_yeonjang",
  "start_interactive_desktop_session",
  "install_supported_yeonjang",
  "select_supported_platform",
])

const activeTabInfoBackendFamilies = new Set<YeonjangBrowserActiveTabInfoBackendFamily>([
  "accessibility_api",
  "browser_extension_bridge",
  "windows_ui_automation",
  "linux_accessibility_api",
  "wayland_portal",
])

const yeonjangPlatformValues = new Set<YeonjangCapabilityPlatform>([
  "linux",
  "windows",
  "macos",
  "unknown",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string") throw new Error(`Invalid active tab readiness field: ${key}`)
  return value
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid active tab readiness field: ${key}`)
  }
  return value
}

function requiredFalse(record: Record<string, unknown>, key: string): false {
  if (record[key] !== false) {
    throw new Error(`Invalid active tab pre-dispatch preview field: ${key}`)
  }
  return false
}

function parsePlatform(value: unknown): YeonjangCapabilityPlatform {
  if (typeof value === "string" && yeonjangPlatformValues.has(value as YeonjangCapabilityPlatform)) {
    return value as YeonjangCapabilityPlatform
  }
  throw new Error("Invalid active tab readiness field: platform")
}

function parseReadinessStatus(value: unknown): YeonjangBrowserActiveTabInfoReadinessStatus {
  if (
    typeof value === "string" &&
    activeTabInfoStatusValues.has(value as YeonjangBrowserActiveTabInfoReadinessStatus)
  ) {
    return value as YeonjangBrowserActiveTabInfoReadinessStatus
  }
  throw new Error("Invalid active tab readiness field: readinessStatus")
}

function parseUserAction(value: unknown): YeonjangBrowserActiveTabInfoReadinessUserAction {
  if (
    typeof value === "string" &&
    activeTabInfoActionValues.has(value as YeonjangBrowserActiveTabInfoReadinessUserAction)
  ) {
    return value as YeonjangBrowserActiveTabInfoReadinessUserAction
  }
  throw new Error("Invalid active tab readiness field: userAction")
}

function parseObservationStatus(
  value: unknown,
): "available" | "permission_required" | "unsupported" | "headless_unavailable" | "unknown" {
  if (
    value === "available" ||
    value === "permission_required" ||
    value === "unsupported" ||
    value === "headless_unavailable" ||
    value === "unknown"
  ) {
    return value
  }
  throw new Error("Invalid active tab pre-dispatch preview field: observationStatus")
}

function parseAdvancedDiagnostic(
  value: unknown,
): YeonjangBrowserActiveTabInfoPublicReadinessTarget["advancedDiagnostic"] | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || !Array.isArray(value.candidateBackendFamilies)) {
    throw new Error("Invalid active tab readiness field: advancedDiagnostic")
  }
  return {
    candidateBackendFamilies: value.candidateBackendFamilies.filter(
      (item): item is YeonjangBrowserActiveTabInfoBackendFamily =>
        typeof item === "string" &&
        activeTabInfoBackendFamilies.has(item as YeonjangBrowserActiveTabInfoBackendFamily),
    ),
  }
}

function parseReadinessTarget(
  value: unknown,
  audience: YeonjangBrowserActiveTabInfoReadinessAudience,
): YeonjangBrowserActiveTabInfoPublicReadinessTarget {
  if (!isRecord(value)) throw new Error("Invalid active tab readiness target")
  const advancedDiagnostic = audience === "advanced"
    ? parseAdvancedDiagnostic(value.advancedDiagnostic)
    : undefined
  return {
    publicTargetName: requiredString(value, "publicTargetName"),
    platform: parsePlatform(value.platform),
    readinessStatus: parseReadinessStatus(value.readinessStatus),
    statusLabel: requiredString(value, "statusLabel"),
    userAction: parseUserAction(value.userAction),
    actionLabel: requiredString(value, "actionLabel"),
    reasonLabel: requiredString(value, "reasonLabel"),
    ...(advancedDiagnostic ? { advancedDiagnostic } : {}),
  }
}

export function parseYeonjangBrowserActiveTabInfoPublicReadinessSummary(
  value: unknown,
  expectedAudience: YeonjangBrowserActiveTabInfoReadinessAudience = "general",
): YeonjangBrowserActiveTabInfoPublicReadinessSummary {
  if (!isRecord(value)) throw new Error("Invalid active tab readiness summary")
  if (value.schemaVersion !== "yeonjang-browser-active-tab-info-public-readiness-summary-v1") {
    throw new Error("Invalid active tab readiness field: schemaVersion")
  }
  if (value.method !== "browser.active_tab_info") {
    throw new Error("Invalid active tab readiness field: method")
  }
  if (value.audience !== expectedAudience) {
    throw new Error("Invalid active tab readiness field: audience")
  }
  if (!Array.isArray(value.targets)) throw new Error("Invalid active tab readiness field: targets")
  return {
    schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
    method: "browser.active_tab_info",
    audience: expectedAudience,
    readyCount: requiredNumber(value, "readyCount"),
    blockedCount: requiredNumber(value, "blockedCount"),
    targets: value.targets.map((target) => parseReadinessTarget(target, expectedAudience)),
  }
}

export function parseYeonjangBrowserActiveTabInfoPreDispatchPreview(
  value: unknown,
): YeonjangBrowserActiveTabInfoPreDispatchPreview {
  if (!isRecord(value)) throw new Error("Invalid active tab pre-dispatch preview")
  if (value.method !== "browser.active_tab_info") {
    throw new Error("Invalid active tab pre-dispatch preview field: method")
  }
  if (value.toolName !== "yeonjang_browser_active_tab_info") {
    throw new Error("Invalid active tab pre-dispatch preview field: toolName")
  }
  const invokeNow = requiredFalse(value, "invokeNow")
  const addRustDispatchNow = requiredFalse(value, "addRustDispatchNow")
  const addProductionBindingNow = requiredFalse(value, "addProductionBindingNow")
  const reasonCode = requiredString(value, "reasonCode")

  if (value.status === "blocked") {
    return {
      status: "blocked",
      reasonCode,
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      invokeNow,
      addRustDispatchNow,
      addProductionBindingNow,
    }
  }

  if (value.status !== "prepared") {
    throw new Error("Invalid active tab pre-dispatch preview field: status")
  }
  if (reasonCode !== "active_tab_info_pre_dispatch_prepared") {
    throw new Error("Invalid active tab pre-dispatch preview field: reasonCode")
  }

  return {
    status: "prepared",
    reasonCode: "active_tab_info_pre_dispatch_prepared",
    method: "browser.active_tab_info",
    toolName: "yeonjang_browser_active_tab_info",
    publicTargetName: requiredString(value, "publicTargetName"),
    platform: parsePlatform(value.platform),
    observationStatus: parseObservationStatus(value.observationStatus),
    browserName: requiredString(value, "browserName"),
    requiredGateCount: requiredNumber(value, "requiredGateCount"),
    invokeNow,
    addRustDispatchNow,
    addProductionBindingNow,
  }
}
