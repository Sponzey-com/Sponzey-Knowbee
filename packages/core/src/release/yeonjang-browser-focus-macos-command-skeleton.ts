import {
  YEONJANG_BROWSER_FOCUS_CONTRACT,
  type YeonjangBrowserFocusCommandContractDecision,
  type YeonjangBrowserFocusPreflightDecision,
  type YeonjangBrowserFocusTargetProjection,
} from "../capabilities/yeonjang-browser-focus-contract.js"

export type YeonjangBrowserFocusMacosCommandSkeletonReasonCode =
  | "macos_browser_focus_command_skeleton_ready"
  | "side_effect_authorization_required"
  | "preflight_not_ready"
  | "command_contract_not_ready"
  | "platform_not_macos"

export type YeonjangBrowserFocusMacosCommandSkeleton =
  | {
      status: "skeleton_ready"
      reasonCode: "macos_browser_focus_command_skeleton_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      platform: "macos"
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
        YeonjangBrowserFocusMacosCommandSkeletonReasonCode,
        "macos_browser_focus_command_skeleton_ready"
      >
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      platform: "macos"
      executeOsFocusNow: false
      commandAccepted: false
      requiresApproval: true
      requiresFocusedTargetObservation: true
      postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode
      auditOnlyFields: string[]
    }

const MACOS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS = [
  "rawWindowTitle",
  "rawUrl",
  "queryToken",
  "pid",
  "windowId",
  "tabId",
  "automationScriptText",
] as const

export function buildYeonjangBrowserFocusMacosCommandSkeleton(input: {
  target: YeonjangBrowserFocusTargetProjection
  preflight: YeonjangBrowserFocusPreflightDecision
  commandContract: YeonjangBrowserFocusCommandContractDecision
  auditOnlyAutomationPlan?: string | undefined
}): YeonjangBrowserFocusMacosCommandSkeleton {
  if (input.preflight.reasonCode === "side_effect_authorization_required") {
    return blockedMacosCommandSkeleton("side_effect_authorization_required")
  }
  if (input.preflight.status !== "ready") {
    return blockedMacosCommandSkeleton("preflight_not_ready")
  }
  if (input.commandContract.platform !== "macos") {
    return blockedMacosCommandSkeleton("platform_not_macos")
  }
  if (input.commandContract.status !== "accepted") {
    return blockedMacosCommandSkeleton("command_contract_not_ready")
  }
  return Object.freeze({
    status: "skeleton_ready",
    reasonCode: "macos_browser_focus_command_skeleton_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    platform: "macos",
    executeOsFocusNow: false,
    commandAccepted: false,
    requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
    requiresFocusedTargetObservation: true,
    postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
    target: input.target,
    auditOnlyFields: [...MACOS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
  })
}

function blockedMacosCommandSkeleton(
  reasonCode: Extract<YeonjangBrowserFocusMacosCommandSkeleton, { status: "skeleton_blocked" }>["reasonCode"],
): Extract<YeonjangBrowserFocusMacosCommandSkeleton, { status: "skeleton_blocked" }> {
  return Object.freeze({
    status: "skeleton_blocked",
    reasonCode,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    platform: "macos",
    executeOsFocusNow: false,
    commandAccepted: false,
    requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
    requiresFocusedTargetObservation: true,
    postCheckMode: YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode,
    auditOnlyFields: [...MACOS_BROWSER_FOCUS_AUDIT_ONLY_FIELDS],
  })
}
