import type {
  YeonjangBrowserActiveTabInfoBackendFamily,
  YeonjangBrowserActiveTabInfoReadinessObservation,
  YeonjangBrowserActiveTabInfoReadinessStatus,
  YeonjangBrowserActiveTabInfoReadinessUserAction,
} from "../capabilities/yeonjang-browser-active-tab-info-contract.js"
import {
  YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT,
  projectYeonjangBrowserActiveTabInfoReadiness,
} from "../capabilities/yeonjang-browser-active-tab-info-contract.js"

export type YeonjangBrowserActiveTabInfoReadinessSummaryAudience = "general" | "advanced"

export interface YeonjangBrowserActiveTabInfoPublicReadinessTarget {
  publicTargetName: string
  platform: "macos" | "windows" | "linux" | "unknown"
  readinessStatus: YeonjangBrowserActiveTabInfoReadinessStatus
  statusLabel: string
  userAction: YeonjangBrowserActiveTabInfoReadinessUserAction
  actionLabel: string
  reasonLabel: string
  advancedDiagnostic?: {
    candidateBackendFamilies: YeonjangBrowserActiveTabInfoBackendFamily[]
  } | undefined
}

export interface YeonjangBrowserActiveTabInfoPublicReadinessSummary {
  schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1"
  method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method
  audience: YeonjangBrowserActiveTabInfoReadinessSummaryAudience
  readyCount: number
  blockedCount: number
  targets: YeonjangBrowserActiveTabInfoPublicReadinessTarget[]
}

export function buildYeonjangBrowserActiveTabInfoPublicReadinessSummary(input: {
  observations: readonly YeonjangBrowserActiveTabInfoReadinessObservation[]
  audience?: YeonjangBrowserActiveTabInfoReadinessSummaryAudience | undefined
}): YeonjangBrowserActiveTabInfoPublicReadinessSummary {
  const audience = input.audience ?? "general"
  const readiness = projectYeonjangBrowserActiveTabInfoReadiness(input.observations)

  return Object.freeze({
    schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
    method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
    audience,
    readyCount: readiness.readyCount,
    blockedCount: readiness.blockedCount,
    targets: Object.freeze(readiness.targets.map((target, index) => {
      const observation = input.observations[index]
      const candidateBackendFamilies = observation?.diagnostic?.candidateBackendFamilies ?? []
      return Object.freeze({
        publicTargetName: target.publicTargetName,
        platform: target.platform,
        readinessStatus: target.readinessStatus,
        statusLabel: statusLabel(target.readinessStatus),
        userAction: target.userAction,
        actionLabel: actionLabel(target.userAction),
        reasonLabel: reasonLabel(observation, target.readinessStatus),
        ...(audience === "advanced" && candidateBackendFamilies.length > 0
          ? {
              advancedDiagnostic: Object.freeze({
                candidateBackendFamilies: Object.freeze([...candidateBackendFamilies]),
              }),
            }
          : {}),
      })
    })) as YeonjangBrowserActiveTabInfoPublicReadinessTarget[],
  })
}

function statusLabel(status: YeonjangBrowserActiveTabInfoReadinessStatus): string {
  switch (status) {
    case "ready":
      return "Ready"
    case "permission_required":
      return "Permission required"
    case "observation_backend_required":
      return "Observation backend required"
    case "headless_unavailable":
      return "Interactive desktop required"
    case "unsupported":
      return "Unsupported runtime"
    case "unknown":
      return "Unknown runtime"
  }
}

function actionLabel(action: YeonjangBrowserActiveTabInfoReadinessUserAction): string {
  switch (action) {
    case "ready_to_request_active_tab_approval":
      return "Request active tab approval"
    case "enable_browser_read_permission":
      return "Enable browser read permission"
    case "update_or_reinstall_yeonjang":
      return "Update or reinstall Yeonjang"
    case "start_interactive_desktop_session":
      return "Start an interactive desktop session"
    case "install_supported_yeonjang":
      return "Install a supported Yeonjang runtime"
    case "select_supported_platform":
      return "Select a supported platform"
  }
}

function reasonLabel(
  observation: YeonjangBrowserActiveTabInfoReadinessObservation | undefined,
  status: YeonjangBrowserActiveTabInfoReadinessStatus,
): string {
  switch (observation?.diagnostic?.reasonCode) {
    case "active_tab_observation_backend_ready":
      return "Active tab observation backend is ready."
    case "active_tab_observation_backend_missing":
      return "Active tab observation backend is not installed or enabled."
    case "browser_read_permission_disabled":
      return "Browser read permission is disabled."
    case "interactive_desktop_required":
      return "Interactive desktop access is required."
    case "unknown":
    case undefined:
      return fallbackReasonLabel(status)
  }
}

function fallbackReasonLabel(status: YeonjangBrowserActiveTabInfoReadinessStatus): string {
  switch (status) {
    case "ready":
      return "Active tab observation is ready."
    case "permission_required":
      return "Browser read permission is required."
    case "observation_backend_required":
      return "Active tab observation backend is required."
    case "headless_unavailable":
      return "Interactive desktop access is unavailable."
    case "unsupported":
      return "This Yeonjang runtime does not advertise active tab observation."
    case "unknown":
      return "Active tab observation readiness is unknown."
  }
}
