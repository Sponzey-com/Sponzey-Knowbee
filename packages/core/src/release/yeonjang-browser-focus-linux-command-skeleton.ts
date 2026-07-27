import {
  YEONJANG_BROWSER_FOCUS_CONTRACT,
  type YeonjangBrowserFocusCommandContractDecision,
  type YeonjangBrowserFocusPreflightDecision,
  type YeonjangBrowserFocusTargetProjection,
} from "../capabilities/yeonjang-browser-focus-contract.js"

export type YeonjangBrowserFocusLinuxCommandSkeletonReasonCode =
  | "linux_browser_focus_command_skeleton_ready"
  | "side_effect_authorization_required"
  | "preflight_not_ready"
  | "command_backend_required"
  | "focused_target_observation_backend_required"
  | "headless_unavailable"
  | "platform_not_linux"

export type YeonjangBrowserFocusLinuxCommandSkeleton =
  | {
      status: "skeleton_ready"
      reasonCode: "linux_browser_focus_command_skeleton_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      platform: "linux"
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
        YeonjangBrowserFocusLinuxCommandSkeletonReasonCode,
        "linux_browser_focus_command_skeleton_ready"
      >
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      platform: "linux"
      executeOsFocusNow: false
      commandAccepted: false
      requiresApproval: true
      requiresFocusedTargetObservation: true
      postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode
      auditOnlyFields: string[]
    }

const LINUX_BROWSER_FOCUS_AUDIT_ONLY_FIELDS = [
  "rawWindowTitle",
  "rawUrl",
  "queryToken",
  "pid",
  "windowId",
  "tabId",
  "xdotoolScriptText",
  "wmctrlScriptText",
  "waylandPortalRequest",
] as const

export function buildYeonjangBrowserFocusLinuxCommandSkeleton(input: {
  target: YeonjangBrowserFocusTargetProjection
  preflight: YeonjangBrowserFocusPreflightDecision
  commandContract: YeonjangBrowserFocusCommandContractDecision
  auditOnlyAutomationPlan?: string | undefined
}): YeonjangBrowserFocusLinuxCommandSkeleton {
  if (input.preflight.reasonCode === "side_effect_authorization_required") {
    return blockedLinuxCommandSkeleton("side_effect_authorization_required")
  }
  if (input.preflight.status !== "ready") {
    return blockedLinuxCommandSkeleton("preflight_not_ready")
  }
  if (input.commandContract.platform !== "linux") {
    return blockedLinuxCommandSkeleton("platform_not_linux")
  }
  if (input.commandContract.status !== "accepted") {
    return blockedLinuxCommandSkeleton(linuxReasonFromCommandContract(input.commandContract.reasonCode))
  }
  return Object.freeze({
    status: "skeleton_ready",
    reasonCode: "linux_browser_focus_command_skeleton_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    platform: "linux",
    executeOsFocusNow: false,
    commandAccepted: false,
    requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
    requiresFocusedTargetObservation: true,
    postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
    target: input.target,
    auditOnlyFields: [...LINUX_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
  })
}

function linuxReasonFromCommandContract(
  reasonCode: Exclude<YeonjangBrowserFocusCommandContractDecision, { status: "accepted" }>["reasonCode"],
): Extract<YeonjangBrowserFocusLinuxCommandSkeleton, { status: "skeleton_blocked" }>["reasonCode"] {
  if (reasonCode === "command_backend_required") return "command_backend_required"
  if (reasonCode === "focused_target_observation_backend_required") {
    return "focused_target_observation_backend_required"
  }
  if (reasonCode === "headless_unavailable") return "headless_unavailable"
  return "preflight_not_ready"
}

function blockedLinuxCommandSkeleton(
  reasonCode: Extract<YeonjangBrowserFocusLinuxCommandSkeleton, { status: "skeleton_blocked" }>["reasonCode"],
): Extract<YeonjangBrowserFocusLinuxCommandSkeleton, { status: "skeleton_blocked" }> {
  return Object.freeze({
    status: "skeleton_blocked",
    reasonCode,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    platform: "linux",
    executeOsFocusNow: false,
    commandAccepted: false,
    requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
    requiresFocusedTargetObservation: true,
    postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
    auditOnlyFields: [...LINUX_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
  })
}
