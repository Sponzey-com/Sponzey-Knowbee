import {
  YEONJANG_BROWSER_FOCUS_CONTRACT,
  type YeonjangBrowserFocusCommandContractDecision,
  type YeonjangBrowserFocusPreflightDecision,
  type YeonjangBrowserFocusTargetProjection,
} from "../capabilities/yeonjang-browser-focus-contract.js"

export type YeonjangBrowserFocusWindowsCommandSkeletonReasonCode =
  | "windows_browser_focus_command_skeleton_ready"
  | "side_effect_authorization_required"
  | "preflight_not_ready"
  | "command_backend_required"
  | "focused_target_observation_backend_required"
  | "headless_unavailable"
  | "platform_not_windows"

export type YeonjangBrowserFocusWindowsCommandSkeleton =
  | {
      status: "skeleton_ready"
      reasonCode: "windows_browser_focus_command_skeleton_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      platform: "windows"
      executeOsFocusNow: false
      commandAccepted: false
      requiresApproval: true
      requiresFocusedTargetObservation: true
      postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode
      target: YeonjangBrowserFocusTargetProjection
      auditOnlyFields: string[]
    }
  | {
      status: "skeleton_blocked"
      reasonCode: Exclude<
        YeonjangBrowserFocusWindowsCommandSkeletonReasonCode,
        "windows_browser_focus_command_skeleton_ready"
      >
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      platform: "windows"
      executeOsFocusNow: false
      commandAccepted: false
      requiresApproval: true
      requiresFocusedTargetObservation: true
      postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode
      auditOnlyFields: string[]
    }

const WINDOWS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS = [
  "rawWindowTitle",
  "rawUrl",
  "queryToken",
  "pid",
  "windowId",
  "tabId",
  "powershellScriptText",
  "win32WindowHandle",
] as const

export function buildYeonjangBrowserFocusWindowsCommandSkeleton(input: {
  target: YeonjangBrowserFocusTargetProjection
  preflight: YeonjangBrowserFocusPreflightDecision
  commandContract: YeonjangBrowserFocusCommandContractDecision
  auditOnlyAutomationPlan?: string | undefined
}): YeonjangBrowserFocusWindowsCommandSkeleton {
  if (input.preflight.reasonCode === "side_effect_authorization_required") {
    return blockedWindowsCommandSkeleton("side_effect_authorization_required")
  }
  if (input.preflight.status !== "ready") {
    return blockedWindowsCommandSkeleton("preflight_not_ready")
  }
  if (input.commandContract.platform !== "windows") {
    return blockedWindowsCommandSkeleton("platform_not_windows")
  }
  if (input.commandContract.status !== "accepted") {
    return blockedWindowsCommandSkeleton(windowsReasonFromCommandContract(input.commandContract.reasonCode))
  }
  return Object.freeze({
    status: "skeleton_ready",
    reasonCode: "windows_browser_focus_command_skeleton_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    platform: "windows",
    executeOsFocusNow: false,
    commandAccepted: false,
    requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
    requiresFocusedTargetObservation: true,
    postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
    target: input.target,
    auditOnlyFields: [...WINDOWS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
  })
}

function windowsReasonFromCommandContract(
  reasonCode: Exclude<YeonjangBrowserFocusCommandContractDecision, { status: "accepted" }>["reasonCode"],
): Extract<YeonjangBrowserFocusWindowsCommandSkeleton, { status: "skeleton_blocked" }>["reasonCode"] {
  if (reasonCode === "command_backend_required") return "command_backend_required"
  if (reasonCode === "focused_target_observation_backend_required") {
    return "focused_target_observation_backend_required"
  }
  if (reasonCode === "headless_unavailable") return "headless_unavailable"
  return "preflight_not_ready"
}

function blockedWindowsCommandSkeleton(
  reasonCode: Extract<YeonjangBrowserFocusWindowsCommandSkeleton, { status: "skeleton_blocked" }>["reasonCode"],
): Extract<YeonjangBrowserFocusWindowsCommandSkeleton, { status: "skeleton_blocked" }> {
  return Object.freeze({
    status: "skeleton_blocked",
    reasonCode,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    platform: "windows",
    executeOsFocusNow: false,
    commandAccepted: false,
    requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
    requiresFocusedTargetObservation: true,
    postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
    auditOnlyFields: [...WINDOWS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
  })
}
