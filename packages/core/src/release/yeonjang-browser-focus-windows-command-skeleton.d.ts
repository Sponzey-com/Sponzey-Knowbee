import { YEONJANG_BROWSER_FOCUS_CONTRACT, type YeonjangBrowserFocusCommandContractDecision, type YeonjangBrowserFocusPreflightDecision, type YeonjangBrowserFocusTargetProjection } from "../capabilities/yeonjang-browser-focus-contract.js";
export type YeonjangBrowserFocusWindowsCommandSkeletonReasonCode = "windows_browser_focus_command_skeleton_ready" | "side_effect_authorization_required" | "preflight_not_ready" | "command_backend_required" | "focused_target_observation_backend_required" | "headless_unavailable" | "platform_not_windows";
export type YeonjangBrowserFocusWindowsCommandSkeleton = {
    status: "skeleton_ready";
    reasonCode: "windows_browser_focus_command_skeleton_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: "windows";
    executeOsFocusNow: false;
    commandAccepted: false;
    requiresApproval: true;
    requiresFocusedTargetObservation: true;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    target: YeonjangBrowserFocusTargetProjection;
    auditOnlyFields: string[];
} | {
    status: "skeleton_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusWindowsCommandSkeletonReasonCode, "windows_browser_focus_command_skeleton_ready">;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: "windows";
    executeOsFocusNow: false;
    commandAccepted: false;
    requiresApproval: true;
    requiresFocusedTargetObservation: true;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    auditOnlyFields: string[];
};
export declare function buildYeonjangBrowserFocusWindowsCommandSkeleton(input: {
    target: YeonjangBrowserFocusTargetProjection;
    preflight: YeonjangBrowserFocusPreflightDecision;
    commandContract: YeonjangBrowserFocusCommandContractDecision;
    auditOnlyAutomationPlan?: string | undefined;
}): YeonjangBrowserFocusWindowsCommandSkeleton;
//# sourceMappingURL=yeonjang-browser-focus-windows-command-skeleton.d.ts.map