export type YeonjangNormalizedCapabilityGroup =
  | "applications"
  | "browser"
  | "camera"
  | "clipboard"
  | "command"
  | "device"
  | "disk"
  | "files"
  | "input"
  | "network"
  | "process"
  | "screen"
  | "system"
  | "unknown"

export type YeonjangCapabilityRiskLevel = "safe" | "moderate" | "dangerous"

export type YeonjangCapabilitySideEffectClass =
  | "delete_local"
  | "input_control"
  | "network"
  | "none"
  | "process_control"
  | "read_local"
  | "screen_read"
  | "system_control"
  | "write_local"

export type YeonjangCapabilitySupportState =
  | "limited"
  | "permission_required"
  | "supported"
  | "unknown"
  | "unsupported"

export type YeonjangCapabilityCompatibilityMode =
  | "legacy_methods_only"
  | "structured_matrix"

export type YeonjangCapabilityIssueSeverity = "error" | "warning"

export interface YeonjangCapabilityClassification {
  group: YeonjangNormalizedCapabilityGroup
  riskLevel: YeonjangCapabilityRiskLevel
  sideEffectClass: YeonjangCapabilitySideEffectClass
}

export interface YeonjangRawCapabilityMatrixEntry {
  supported?: boolean
  supportState?: unknown
  requiresApproval?: boolean
  requiresPermission?: boolean
  permissionSetting?: string | null
  outputModes?: readonly string[]
  lastCheckedAt?: number
}

export interface YeonjangRawMethodCapabilityEntry {
  name?: string
  implemented?: boolean
}

export interface YeonjangCapabilityNormalizeInput {
  capabilityMatrix?: Record<string, YeonjangRawCapabilityMatrixEntry> | null
  capability_matrix?: Record<string, YeonjangRawCapabilityMatrixEntry> | null
  methods?: readonly YeonjangRawMethodCapabilityEntry[] | null
}

export interface YeonjangNormalizedCapability extends YeonjangCapabilityClassification {
  capabilityId: string
  method: string
  supportState: YeonjangCapabilitySupportState
  requiresApproval: boolean
  requiresPermission: boolean
  permissionSetting: string | null
  outputModes: readonly string[]
  lastCheckedAt: number | null
  compatibilityMode: YeonjangCapabilityCompatibilityMode
}

export interface YeonjangCapabilitySchemaIssue {
  method?: string
  reasonCode:
    | "empty_method_name"
    | "invalid_support_state"
    | "legacy_methods_only"
    | "web_search_capability_removed"
    | "missing_capability_source"
  severity: YeonjangCapabilityIssueSeverity
}

export interface YeonjangCapabilityNormalizeResult {
  capabilities: readonly YeonjangNormalizedCapability[]
  issues: readonly YeonjangCapabilitySchemaIssue[]
}

const SUPPORT_STATES = new Set<YeonjangCapabilitySupportState>([
  "limited",
  "permission_required",
  "supported",
  "unknown",
  "unsupported",
])

function normalizeMethodName(method: string): string {
  return method.trim().toLowerCase().replaceAll("-", "_")
}

export function isYeonjangWebSearchCapabilityMethod(method: string): boolean {
  const normalized = normalizeMethodName(method)
  return normalized === "web.search"
    || normalized === "web_search"
    || normalized === "search.web"
    || normalized === "search_web"
    || normalized === "browser.search"
    || normalized === "browser_search"
    || normalized === "browser.web_search"
    || normalized === "browser.internet_search"
    || normalized === "browser.browse_web"
    || normalized === "browser.web_browse"
    || normalized === "browser.google_search"
    || normalized === "web.browse"
    || normalized === "web_browse"
    || normalized === "internet.search"
    || normalized === "internet_search"
    || normalized === "internet.browse"
    || normalized === "internet_browse"
    || normalized === "search.internet"
    || normalized === "search_internet"
    || normalized === "network.web_search"
    || normalized === "network.internet_search"
    || normalized === "google.search"
    || normalized === "google_search"
    || normalized === "bing.search"
    || normalized === "bing_search"
    || normalized === "brave.search"
    || normalized === "brave_search"
    || normalized === "duckduckgo.search"
    || normalized === "duckduckgo_search"
    || normalized === "tavily.search"
    || normalized === "tavily_search"
    || normalized === "serp.search"
    || normalized === "serp_search"
}

export function classifyYeonjangCapabilityMethod(
  method: string,
): YeonjangCapabilityClassification {
  const normalized = normalizeMethodName(method)

  if (normalized === "file.delete" || normalized === "filesystem.delete") {
    return { group: "files", riskLevel: "dangerous", sideEffectClass: "delete_local" }
  }
  if (
    normalized === "file.write" ||
    normalized === "file.patch" ||
    normalized === "filesystem.write" ||
    normalized === "filesystem.patch"
  ) {
    return { group: "files", riskLevel: "moderate", sideEffectClass: "write_local" }
  }
  if (/^(file|filesystem)\.(read|list|search|metadata|stat)$/u.test(normalized)) {
    return { group: "files", riskLevel: "safe", sideEffectClass: "read_local" }
  }
  if (/^disk\./u.test(normalized)) {
    return { group: "disk", riskLevel: "safe", sideEffectClass: "read_local" }
  }
  if (normalized === "camera.capture") {
    return { group: "camera", riskLevel: "moderate", sideEffectClass: "screen_read" }
  }
  if (normalized === "camera.list") {
    return { group: "camera", riskLevel: "safe", sideEffectClass: "read_local" }
  }
  if (/^screen\./u.test(normalized)) {
    return { group: "screen", riskLevel: "moderate", sideEffectClass: "screen_read" }
  }
  if (normalized === "mouse.position" || normalized === "input.focused_target") {
    return { group: "input", riskLevel: "safe", sideEffectClass: "read_local" }
  }
  if (/^(keyboard|mouse|input)\./u.test(normalized)) {
    return { group: "input", riskLevel: "moderate", sideEffectClass: "input_control" }
  }
  if (normalized === "browser.list" || normalized === "browser.active_hint") {
    return { group: "browser", riskLevel: "safe", sideEffectClass: "read_local" }
  }
  if (normalized === "browser.active_tab_info") {
    return { group: "browser", riskLevel: "moderate", sideEffectClass: "read_local" }
  }
  if (/^browser\./u.test(normalized)) {
    return { group: "browser", riskLevel: "moderate", sideEffectClass: "process_control" }
  }
  if (normalized === "process.kill") {
    return { group: "process", riskLevel: "dangerous", sideEffectClass: "process_control" }
  }
  if (normalized === "process.focus_window") {
    return { group: "process", riskLevel: "moderate", sideEffectClass: "process_control" }
  }
  if (/^process\./u.test(normalized)) {
    return { group: "process", riskLevel: "safe", sideEffectClass: "read_local" }
  }
  if (normalized === "system.exec") {
    return { group: "command", riskLevel: "dangerous", sideEffectClass: "system_control" }
  }
  if (normalized === "system.control") {
    return { group: "system", riskLevel: "dangerous", sideEffectClass: "system_control" }
  }
  if (/^system\./u.test(normalized) || normalized === "node.capabilities" || normalized === "node.ping") {
    return { group: "system", riskLevel: "safe", sideEffectClass: "read_local" }
  }
  if (/^application\./u.test(normalized) || /^app\./u.test(normalized)) {
    return { group: "applications", riskLevel: "moderate", sideEffectClass: "process_control" }
  }
  if (normalized === "clipboard.write") {
    return { group: "clipboard", riskLevel: "moderate", sideEffectClass: "write_local" }
  }
  if (normalized === "clipboard.read") {
    return { group: "clipboard", riskLevel: "safe", sideEffectClass: "read_local" }
  }
  if (/^network\./u.test(normalized)) {
    return { group: "network", riskLevel: "safe", sideEffectClass: "network" }
  }
  if (/^device\./u.test(normalized)) {
    return { group: "device", riskLevel: "safe", sideEffectClass: "read_local" }
  }

  return { group: "unknown", riskLevel: "safe", sideEffectClass: "none" }
}

function supportStateFromMatrixEntry(input: {
  method: string
  entry: YeonjangRawCapabilityMatrixEntry
  issues: YeonjangCapabilitySchemaIssue[]
}): YeonjangCapabilitySupportState {
  if (typeof input.entry.supportState === "string") {
    const value = input.entry.supportState.trim().toLowerCase()
    if (SUPPORT_STATES.has(value as YeonjangCapabilitySupportState)) {
      return value as YeonjangCapabilitySupportState
    }
    input.issues.push({
      method: input.method,
      reasonCode: "invalid_support_state",
      severity: "error",
    })
    return "unknown"
  }
  if (input.entry.supported === true) return "supported"
  if (input.entry.supported === false) return "unsupported"
  return "unknown"
}

function normalizeMatrixCapability(input: {
  method: string
  entry: YeonjangRawCapabilityMatrixEntry
  issues: YeonjangCapabilitySchemaIssue[]
}): YeonjangNormalizedCapability {
  const classification = classifyYeonjangCapabilityMethod(input.method)
  return Object.freeze({
    capabilityId: `yeonjang:${input.method}`,
    method: input.method,
    ...classification,
    supportState: supportStateFromMatrixEntry(input),
    requiresApproval: input.entry.requiresApproval === true,
    requiresPermission: input.entry.requiresPermission === true,
    permissionSetting: input.entry.permissionSetting ?? null,
    outputModes: Object.freeze([...(input.entry.outputModes ?? [])]),
    lastCheckedAt: typeof input.entry.lastCheckedAt === "number" ? input.entry.lastCheckedAt : null,
    compatibilityMode: "structured_matrix",
  }) as YeonjangNormalizedCapability
}

function normalizeLegacyMethodCapability(
  method: string,
  implemented: boolean,
): YeonjangNormalizedCapability {
  const classification = classifyYeonjangCapabilityMethod(method)
  return Object.freeze({
    capabilityId: `yeonjang:${method}`,
    method,
    ...classification,
    supportState: implemented ? "supported" : "unsupported",
    requiresApproval: false,
    requiresPermission: false,
    permissionSetting: null,
    outputModes: Object.freeze([]),
    lastCheckedAt: null,
    compatibilityMode: "legacy_methods_only",
  }) as YeonjangNormalizedCapability
}

export function normalizeYeonjangCapabilityMatrix(
  input: YeonjangCapabilityNormalizeInput,
): YeonjangCapabilityNormalizeResult {
  const issues: YeonjangCapabilitySchemaIssue[] = []
  const matrix = input.capabilityMatrix ?? input.capability_matrix ?? null
  if (matrix) {
    const capabilities = Object.entries(matrix)
      .flatMap(([rawMethod, entry]) => {
        const method = normalizeMethodName(rawMethod)
        if (!method) {
          issues.push({ reasonCode: "empty_method_name", severity: "error" })
        }
        if (isYeonjangWebSearchCapabilityMethod(method)) {
          issues.push({
            method,
            reasonCode: "web_search_capability_removed",
            severity: "warning",
          })
          return []
        }
        return [normalizeMatrixCapability({ method, entry, issues })]
      })
      .sort((left, right) => left.method.localeCompare(right.method))
    return Object.freeze({
      capabilities: Object.freeze(capabilities) as readonly YeonjangNormalizedCapability[],
      issues: Object.freeze(issues) as readonly YeonjangCapabilitySchemaIssue[],
    })
  }

  if (input.methods) {
    issues.push({ reasonCode: "legacy_methods_only", severity: "warning" })
    const capabilities = input.methods
      .flatMap((entry) => {
        const method = normalizeMethodName(entry.name ?? "")
        if (!method) {
          issues.push({ reasonCode: "empty_method_name", severity: "error" })
        }
        if (isYeonjangWebSearchCapabilityMethod(method)) {
          issues.push({
            method,
            reasonCode: "web_search_capability_removed",
            severity: "warning",
          })
          return []
        }
        return [normalizeLegacyMethodCapability(method, entry.implemented === true)]
      })
      .sort((left, right) => left.method.localeCompare(right.method))
    return Object.freeze({
      capabilities: Object.freeze(capabilities) as readonly YeonjangNormalizedCapability[],
      issues: Object.freeze(issues) as readonly YeonjangCapabilitySchemaIssue[],
    })
  }

  return Object.freeze({
    capabilities: Object.freeze([]) as readonly YeonjangNormalizedCapability[],
    issues: Object.freeze([
      { reasonCode: "missing_capability_source", severity: "warning" },
    ]) as readonly YeonjangCapabilitySchemaIssue[],
  })
}
