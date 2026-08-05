import { YEONJANG_BROWSER_FOCUS_CONTRACT, type YeonjangBrowserFocusTargetProjection } from "../capabilities/yeonjang-browser-focus-contract.js";
export type YeonjangBrowserFocusMacosExecutorReasonCode = "macos_browser_focus_command_accepted" | "macos_browser_focus_command_rejected" | "macos_browser_focus_command_failed" | "command_plan_not_ready" | "side_effect_authorization_required" | "capability_not_supported" | "command_backend_required" | "focused_target_observation_backend_required" | "headless_unavailable" | "target_identity_required" | "unsupported_browser_focus_backend_family";
export type YeonjangBrowserFocusMacosExecutorBridgeReasonCode = "focused_target_matched" | "target_observation_required" | "focused_target_mismatch" | "browser_focus_command_failed" | "command_skeleton_not_ready";
export interface YeonjangBrowserFocusMacosPrivateExecutorResult {
    commandAccepted: boolean;
    reasonCode: YeonjangBrowserFocusMacosExecutorReasonCode;
    focusedTargetObservationRequired: true;
    goalSuccess: false;
}
export interface YeonjangBrowserFocusPublicTargetEvidence {
    schemaVersion: YeonjangBrowserFocusTargetProjection["schemaVersion"];
    targetKind: YeonjangBrowserFocusTargetProjection["targetKind"];
    targetAlias?: string | undefined;
    displayName: string;
    processName?: string | undefined;
    titleHash?: string | undefined;
    titleLength?: number | undefined;
    urlScheme?: "http" | "https" | undefined;
    urlHash?: string | undefined;
    urlLength?: number | undefined;
}
export type YeonjangBrowserFocusMacosExecutorReleaseBridgeSkeleton = {
    status: "skeleton_ready";
    reasonCode: string;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: "macos";
    executeOsFocusNow: false;
    commandAccepted: false;
    requiresApproval: true;
    requiresFocusedTargetObservation: true;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    target: YeonjangBrowserFocusTargetProjection;
    auditOnlyFields: readonly string[];
} | {
    status: "skeleton_blocked";
    reasonCode: string;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: "macos";
    executeOsFocusNow: false;
    commandAccepted: false;
    requiresApproval: true;
    requiresFocusedTargetObservation: true;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    auditOnlyFields: readonly string[];
};
export type YeonjangBrowserFocusMacosExecutorReleaseBridge = {
    schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    platform: "macos";
    status: "bridge_verified";
    reasonCode: "focused_target_matched";
    postCheckState: "VERIFIED";
    executorReasonCode: YeonjangBrowserFocusMacosExecutorReasonCode;
    commandAccepted: true;
    goalSuccess: true;
    addProductionBindingNow: false;
    dispatcherRegistrationNow: false;
    expectedTarget: YeonjangBrowserFocusPublicTargetEvidence;
    observedFocusedTarget: YeonjangBrowserFocusPublicTargetEvidence;
} | {
    schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    platform: "macos";
    status: "bridge_manual_intervention";
    reasonCode: "target_observation_required" | "focused_target_mismatch";
    postCheckState: "MANUAL_INTERVENTION";
    executorReasonCode: YeonjangBrowserFocusMacosExecutorReasonCode;
    commandAccepted: true;
    goalSuccess: false;
    addProductionBindingNow: false;
    dispatcherRegistrationNow: false;
    expectedTarget: YeonjangBrowserFocusPublicTargetEvidence;
    observedFocusedTarget?: YeonjangBrowserFocusPublicTargetEvidence | undefined;
} | {
    schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    platform: "macos";
    status: "bridge_failed";
    reasonCode: "browser_focus_command_failed";
    postCheckState: "FAILED";
    executorReasonCode: YeonjangBrowserFocusMacosExecutorReasonCode;
    commandAccepted: false;
    goalSuccess: false;
    addProductionBindingNow: false;
    dispatcherRegistrationNow: false;
    expectedTarget: YeonjangBrowserFocusPublicTargetEvidence;
    observedFocusedTarget?: YeonjangBrowserFocusPublicTargetEvidence | undefined;
} | {
    schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    platform: "macos";
    status: "bridge_blocked";
    reasonCode: "command_skeleton_not_ready";
    postCheckState: "BLOCKED";
    executorReasonCode: "not_invoked";
    commandAccepted: false;
    goalSuccess: false;
    addProductionBindingNow: false;
    dispatcherRegistrationNow: false;
};
export declare function bridgeYeonjangBrowserFocusMacosExecutorResult(input: {
    skeleton: YeonjangBrowserFocusMacosExecutorReleaseBridgeSkeleton;
    executorResult: YeonjangBrowserFocusMacosPrivateExecutorResult;
    observedFocusedTarget?: YeonjangBrowserFocusTargetProjection | undefined;
    auditOnlyDetails?: Record<string, unknown> | undefined;
}): YeonjangBrowserFocusMacosExecutorReleaseBridge;
//# sourceMappingURL=yeonjang-browser-focus-macos-executor-release-bridge.d.ts.map