import type {
  YeonjangBrowserActiveTabInfoObservation,
  YeonjangBrowserActiveTabInfoProjectionResult,
  YeonjangBrowserActiveTabInfoBackendFamily,
  YeonjangBrowserActiveTabInfoDesktopSession,
  YeonjangBrowserActiveTabObservationStatus,
  YeonjangBrowserActiveTabInfoReadinessDiagnostic,
  YeonjangBrowserActiveTabInfoReadinessDiagnosticReason,
  YeonjangBrowserActiveTabInfoReadinessObservation,
  YeonjangBrowserActiveTabInfoReadinessPlatform,
} from "../capabilities/yeonjang-browser-active-tab-info-contract.js"
import { projectYeonjangBrowserActiveTabInfo } from "../capabilities/yeonjang-browser-active-tab-info-contract.js"

export type YeonjangBrowserActiveTabInfoToolHealthStatus =
  | "ready"
  | "permission_disabled"
  | "unsupported"
  | "unknown"
  | "error"

export interface YeonjangBrowserActiveTabInfoToolHealthRecord {
  status?: YeonjangBrowserActiveTabInfoToolHealthStatus | undefined
  reasonCode?: string | undefined
  candidateBackendFamilies?: readonly unknown[] | undefined
  rawDetails?: Record<string, unknown> | undefined
}

export interface YeonjangBrowserActiveTabInfoRegistryRecord {
  publicTargetName: string
  internalInstanceId?: string | undefined
  sessionId?: string | undefined
  clientId?: string | undefined
  platform: YeonjangBrowserActiveTabInfoReadinessPlatform
  desktopSession: YeonjangBrowserActiveTabInfoDesktopSession
  methods: readonly string[]
  permissions: {
    allow_browser_read?: boolean | undefined
    [key: string]: unknown
  }
  toolHealth: {
    "browser.active_tab_info"?: YeonjangBrowserActiveTabInfoToolHealthRecord | undefined
    [key: string]: YeonjangBrowserActiveTabInfoToolHealthRecord | undefined
  }
  rawMqttPayload?: Record<string, unknown> | undefined
}

export type YeonjangBrowserActiveTabInfoRedactedObservationSourceResult =
  | { ok: true; observation: YeonjangBrowserActiveTabInfoObservation }
  | {
      ok: false
      reasonCode:
        | "active_tab_info_redacted_source_missing"
        | "active_tab_info_redacted_source_ambiguous"
        | Extract<YeonjangBrowserActiveTabInfoProjectionResult, { ok: false }>["reasonCode"]
    }

export function assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry(input: {
  records: readonly YeonjangBrowserActiveTabInfoRegistryRecord[]
}): YeonjangBrowserActiveTabInfoReadinessObservation[] {
  return input.records.map((record) => {
    const health = record.toolHealth["browser.active_tab_info"]
    const capabilityAdvertised = record.methods.includes("browser.active_tab_info")
    const diagnostic = normalizeDiagnostic(health)
    return Object.freeze({
      publicTargetName: normalizePublicName(record.publicTargetName),
      platform: record.platform,
      desktopSession: record.desktopSession,
      capabilityAdvertised,
      permissionGranted: record.permissions.allow_browser_read === true,
      observationBackendAvailable: capabilityAdvertised && health?.status === "ready",
      ...(diagnostic ? { diagnostic } : {}),
    })
  })
}

export function selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry(input: {
  publicTargetName: string
  records: readonly YeonjangBrowserActiveTabInfoRegistryRecord[]
}): YeonjangBrowserActiveTabInfoRedactedObservationSourceResult {
  const targetName = normalizePublicName(input.publicTargetName)
  const matches = input.records.filter((record) => normalizePublicName(record.publicTargetName) === targetName)
  if (matches.length === 0) return { ok: false, reasonCode: "active_tab_info_redacted_source_missing" }
  if (matches.length > 1) return { ok: false, reasonCode: "active_tab_info_redacted_source_ambiguous" }

  const record = matches[0]
  const health = record?.toolHealth["browser.active_tab_info"]
  const rawDetails = health?.rawDetails
  const projection = projectYeonjangBrowserActiveTabInfo({
    browserName: readString(rawDetails, "browserName"),
    title: readString(rawDetails, "title"),
    url: readString(rawDetails, "url"),
    profileName: readString(rawDetails, "profileName"),
    profilePath: readString(rawDetails, "profilePath"),
    pid: readNumber(rawDetails, "pid"),
    windowId: readString(rawDetails, "windowId"),
    tabId: readString(rawDetails, "tabId"),
    observationStatus: observationStatusFromHealth(health),
  })

  if (!projection.ok) return projection
  return { ok: true, observation: projection.observation }
}

function normalizePublicName(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ")
  return normalized || "Yeonjang target"
}

const PUBLIC_REASON_CODES = new Set<YeonjangBrowserActiveTabInfoReadinessDiagnosticReason>([
  "active_tab_observation_backend_ready",
  "active_tab_observation_backend_missing",
  "browser_read_permission_disabled",
  "interactive_desktop_required",
  "unknown",
])

const PUBLIC_BACKEND_FAMILIES = new Set<YeonjangBrowserActiveTabInfoBackendFamily>([
  "accessibility_api",
  "browser_extension_bridge",
  "windows_ui_automation",
  "linux_accessibility_api",
  "wayland_portal",
])

function normalizeDiagnostic(
  health: YeonjangBrowserActiveTabInfoToolHealthRecord | undefined,
): YeonjangBrowserActiveTabInfoReadinessDiagnostic | undefined {
  if (!health) return undefined
  const reasonCode = normalizeReasonCode(health.reasonCode)
  const candidateBackendFamilies = normalizeBackendFamilies(health.candidateBackendFamilies)

  if (reasonCode === "unknown" && candidateBackendFamilies.length === 0) {
    return undefined
  }

  return Object.freeze({
    reasonCode,
    candidateBackendFamilies,
  })
}

function normalizeReasonCode(
  value: string | undefined,
): YeonjangBrowserActiveTabInfoReadinessDiagnosticReason {
  if (value && PUBLIC_REASON_CODES.has(value as YeonjangBrowserActiveTabInfoReadinessDiagnosticReason)) {
    return value as YeonjangBrowserActiveTabInfoReadinessDiagnosticReason
  }
  return "unknown"
}

function normalizeBackendFamilies(
  values: readonly unknown[] | undefined,
): YeonjangBrowserActiveTabInfoBackendFamily[] {
  if (!values) return []
  return values.filter((value): value is YeonjangBrowserActiveTabInfoBackendFamily => (
    typeof value === "string" && PUBLIC_BACKEND_FAMILIES.has(value as YeonjangBrowserActiveTabInfoBackendFamily)
  ))
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === "string" ? value : undefined
}

function readNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === "number" ? value : undefined
}

function observationStatusFromHealth(
  health: YeonjangBrowserActiveTabInfoToolHealthRecord | undefined,
): YeonjangBrowserActiveTabObservationStatus {
  switch (health?.status) {
    case "ready":
      return "available"
    case "permission_disabled":
      return "permission_required"
    case "unsupported":
      return "unsupported"
    default:
      return "unknown"
  }
}
