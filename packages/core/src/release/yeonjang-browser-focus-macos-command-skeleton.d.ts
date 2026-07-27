import { YEONJANG_BROWSER_FOCUS_CONTRACT, type YeonjangBrowserFocusCommandContractDecision, type YeonjangBrowserFocusPreflightDecision, type YeonjangBrowserFocusTargetProjection } from "../capabilities/yeonjang-browser-focus-contract.js";
export type YeonjangBrowserFocusMacosCommandSkeletonReasonCode = "macos_browser_focus_command_skeleton_ready" | "side_effect_authorization_required" | "preflight_not_ready" | "command_contract_not_ready" | "platform_not_macos";
export type YeonjangBrowserFocusMacosCommandSkeleton = {
    status: "skeleton_ready";
    reasonCode: "macos_browser_focus_command_skeleton_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: "macos";
    executeOsFocusNow: false;
    commandAccepted: false;
    requiresApproval: true;
    requiresFocusedTargetObservation: true;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    target: YeonjangBrowserFocusTargetProjection;
    auditOnlyFields: string[];
} | {
    status: "skeleton_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusMacosCommandSkeletonReasonCode, "macos_browser_focus_command_skeleton_ready">;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: "macos";
    executeOsFocusNow: false;
    commandAccepted: false;
    requiresApproval: true;
    requiresFocusedTargetObservation: true;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    auditOnlyFields: string[];
};
export declare function buildYeonjangBrowserFocusMacosCommandSkeleton(input: {
    target: YeonjangBrowserFocusTargetProjection;
    preflight: YeonjangBrowserFocusPreflightDecision;
    commandContract: YeonjangBrowserFocusCommandContractDecision;
    auditOnlyAutomationPlan?: string | undefined;
}): YeonjangBrowserFocusMacosCommandSkeleton;
//# sourceMappingURL=yeonjang-browser-focus-macos-command-skeleton.d.ts.map