import type {
  YeonjangBrowserActiveTabInfoBackendFamily,
  YeonjangBrowserActiveTabInfoPublicReadinessSummary,
  YeonjangBrowserActiveTabInfoPublicReadinessTarget,
  YeonjangBrowserActiveTabInfoReadinessStatus,
  YeonjangBrowserActiveTabInfoReadinessUserAction,
  YeonjangCapabilityPlatform,
} from "../contracts/yeonjang"

type TextFn = (ko: string, en: string) => string

export type YeonjangActiveTabInfoReadinessTone = "ready" | "warning" | "blocked" | "unknown"

export interface YeonjangActiveTabInfoGeneralTargetView {
  targetName: string
  platformLabel: string
  status: YeonjangBrowserActiveTabInfoReadinessStatus
  statusLabel: string
  userAction: YeonjangBrowserActiveTabInfoReadinessUserAction
  actionLabel: string
  reasonLabel: string
  tone: YeonjangActiveTabInfoReadinessTone
  priority: number
}

export interface YeonjangActiveTabInfoGeneralGroupView {
  count: number
  targets: YeonjangActiveTabInfoGeneralTargetView[]
}

export interface YeonjangActiveTabInfoPrimaryActionView {
  userAction: YeonjangBrowserActiveTabInfoReadinessUserAction
  label: string
  targetName: string
}

export interface YeonjangActiveTabInfoGeneralReadinessView {
  method: "browser.active_tab_info"
  audience: "general"
  overallStatus: "ready" | "action_required" | "unavailable"
  title: string
  summary: string
  targetCount: number
  readyCount: number
  blockedCount: number
  primaryAction: YeonjangActiveTabInfoPrimaryActionView | null
  groups: {
    ready: YeonjangActiveTabInfoGeneralGroupView
    blocked: YeonjangActiveTabInfoGeneralGroupView
  }
}

export interface YeonjangActiveTabInfoAdvancedTargetView {
  targetName: string
  platformLabel: string
  statusLabel: string
  backendFamilyLabels: string[]
}

export interface YeonjangActiveTabInfoAdvancedReadinessView {
  method: "browser.active_tab_info"
  audience: "advanced"
  title: string
  summary: string
  targets: YeonjangActiveTabInfoAdvancedTargetView[]
}

export function buildYeonjangBrowserActiveTabInfoGeneralReadinessView(
  summary: YeonjangBrowserActiveTabInfoPublicReadinessSummary,
  text: TextFn,
): YeonjangActiveTabInfoGeneralReadinessView {
  if (summary.audience !== "general") {
    throw new Error("active_tab_info_general_summary_required")
  }

  const targets = summary.targets
    .map((target) => buildGeneralTargetView(target, text))
    .sort((left, right) => left.priority - right.priority || left.targetName.localeCompare(right.targetName, "ko"))
  const readyTargets = targets.filter((target) => target.status === "ready")
  const blockedTargets = targets.filter((target) => target.status !== "ready")
  const primaryActionTarget = blockedTargets[0] ?? null

  return {
    method: "browser.active_tab_info",
    audience: "general",
    overallStatus: resolveOverallStatus(summary, blockedTargets.length),
    title: text("활성 탭 확인 준비", "Active tab readiness"),
    summary: buildGeneralSummaryText(summary, text),
    targetCount: summary.targets.length,
    readyCount: summary.readyCount,
    blockedCount: summary.blockedCount,
    primaryAction: primaryActionTarget
      ? {
          userAction: primaryActionTarget.userAction,
          label: primaryActionTarget.actionLabel,
          targetName: primaryActionTarget.targetName,
        }
      : null,
    groups: {
      ready: {
        count: readyTargets.length,
        targets: readyTargets,
      },
      blocked: {
        count: blockedTargets.length,
        targets: blockedTargets,
      },
    },
  }
}

export function buildYeonjangBrowserActiveTabInfoAdvancedReadinessView(
  summary: YeonjangBrowserActiveTabInfoPublicReadinessSummary,
  text: TextFn,
): YeonjangActiveTabInfoAdvancedReadinessView {
  if (summary.audience !== "advanced") {
    throw new Error("active_tab_info_advanced_summary_required")
  }

  return {
    method: "browser.active_tab_info",
    audience: "advanced",
    title: text("활성 탭 진단", "Active tab diagnostics"),
    summary: text(
      "고급 진단에서만 관찰 backend 후보를 확인합니다.",
      "Observation backend candidates are visible only in advanced diagnostics.",
    ),
    targets: summary.targets.map((target) => ({
      targetName: target.publicTargetName,
      platformLabel: platformLabel(target.platform, text),
      statusLabel: target.statusLabel,
      backendFamilyLabels: (target.advancedDiagnostic?.candidateBackendFamilies ?? [])
        .map((family) => backendFamilyLabel(family)),
    })),
  }
}

function buildGeneralTargetView(
  target: YeonjangBrowserActiveTabInfoPublicReadinessTarget,
  text: TextFn,
): YeonjangActiveTabInfoGeneralTargetView {
  return {
    targetName: target.publicTargetName,
    platformLabel: platformLabel(target.platform, text),
    status: target.readinessStatus,
    statusLabel: target.statusLabel,
    userAction: target.userAction,
    actionLabel: target.actionLabel,
    reasonLabel: target.reasonLabel,
    tone: statusTone(target.readinessStatus),
    priority: actionPriority(target.userAction),
  }
}

function resolveOverallStatus(
  summary: YeonjangBrowserActiveTabInfoPublicReadinessSummary,
  blockedTargetCount: number,
): YeonjangActiveTabInfoGeneralReadinessView["overallStatus"] {
  if (summary.targets.length === 0) return "unavailable"
  if (blockedTargetCount > 0) return "action_required"
  return "ready"
}

function buildGeneralSummaryText(
  summary: YeonjangBrowserActiveTabInfoPublicReadinessSummary,
  text: TextFn,
): string {
  if (summary.targets.length === 0) {
    return text("활성 탭을 확인할 수 있는 연장이 없습니다.", "No Yeonjang target can report active tab readiness.")
  }
  if (summary.blockedCount > 0) {
    return text(
      `확인 필요 ${summary.blockedCount}개, 준비됨 ${summary.readyCount}개`,
      `${summary.blockedCount} need attention, ${summary.readyCount} ready`,
    )
  }
  return text(
    `활성 탭 확인 준비 완료 ${summary.readyCount}개`,
    `${summary.readyCount} targets are ready for active tab checks`,
  )
}

function statusTone(status: YeonjangBrowserActiveTabInfoReadinessStatus): YeonjangActiveTabInfoReadinessTone {
  switch (status) {
    case "ready":
      return "ready"
    case "permission_required":
    case "observation_backend_required":
      return "warning"
    case "headless_unavailable":
    case "unsupported":
      return "blocked"
    case "unknown":
      return "unknown"
  }
}

function actionPriority(action: YeonjangBrowserActiveTabInfoReadinessUserAction): number {
  switch (action) {
    case "enable_browser_read_permission":
      return 10
    case "update_or_reinstall_yeonjang":
      return 20
    case "start_interactive_desktop_session":
      return 30
    case "install_supported_yeonjang":
      return 40
    case "select_supported_platform":
      return 50
    case "ready_to_request_active_tab_approval":
      return 90
  }
}

function platformLabel(platform: YeonjangCapabilityPlatform, text: TextFn): string {
  switch (platform) {
    case "macos":
      return "macOS"
    case "windows":
      return "Windows"
    case "linux":
      return "Linux"
    case "unknown":
      return text("알 수 없음", "Unknown")
  }
}

function backendFamilyLabel(family: YeonjangBrowserActiveTabInfoBackendFamily): string {
  switch (family) {
    case "accessibility_api":
      return "Accessibility API"
    case "browser_extension_bridge":
      return "Browser extension bridge"
    case "windows_ui_automation":
      return "Windows UI Automation"
    case "linux_accessibility_api":
      return "Linux accessibility API"
    case "wayland_portal":
      return "Wayland portal"
  }
}
