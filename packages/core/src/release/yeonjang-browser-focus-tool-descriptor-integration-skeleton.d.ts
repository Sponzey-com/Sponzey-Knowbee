import { YEONJANG_BROWSER_FOCUS_CONTRACT, type YeonjangBrowserFocusPreflightDecision } from "../capabilities/yeonjang-browser-focus-contract.js";
import type { YeonjangBrowserFocusRegistrationPreconditionDecision } from "./yeonjang-browser-focus-registration-precondition.js";
export interface YeonjangBrowserFocusToolDescriptorSkeleton {
    toolName: "yeonjang_browser_focus";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    riskLevel: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.riskLevel;
    sideEffectClass: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.sideEffectClass;
    permissionSetting: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting;
    requiresApproval: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval;
    runtimeHealthMode: "required";
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    rawPayloadVisibility: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.rawPayloadVisibility;
    defaultLiveSmokeAllowed: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.defaultLiveSmokeAllowed;
}
export interface YeonjangBrowserFocusCommandSkeletonIntegrationInput {
    status: "skeleton_ready" | "skeleton_blocked";
    reasonCode: string;
    commandAccepted: false;
    executeOsFocusNow: false;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    auditOnlyFields: readonly string[];
}
export type YeonjangBrowserFocusToolDescriptorIntegrationGate = "tool_descriptor" | "side_effect_method_contract" | "approval_preflight" | "registration_precondition" | "command_skeleton" | "focused_target_observation_backend" | "raw_payload_redaction";
export type YeonjangBrowserFocusToolDescriptorIntegrationSkeletonReasonCode = "browser_focus_tool_descriptor_integration_skeleton_ready" | "tool_not_registered" | "descriptor_contract_mismatch" | "production_exposure_not_executable" | "side_effect_method_contract_not_bound" | "side_effect_authorization_required" | "preflight_not_ready" | "command_skeleton_not_ready" | "focused_target_observation_backend_required";
export type YeonjangBrowserFocusToolDescriptorIntegrationSkeleton = {
    status: "integration_skeleton_ready";
    reasonCode: "browser_focus_tool_descriptor_integration_skeleton_ready";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    addProductionBindingNow: false;
    executable: false;
    dispatcherIntegrationNow: false;
    descriptor: YeonjangBrowserFocusToolDescriptorSkeleton;
    requiredGates: YeonjangBrowserFocusToolDescriptorIntegrationGate[];
} | {
    status: "integration_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusToolDescriptorIntegrationSkeletonReasonCode, "browser_focus_tool_descriptor_integration_skeleton_ready">;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    addProductionBindingNow: false;
    executable: false;
    dispatcherIntegrationNow: false;
    blockedBy: string;
    requiredGates: YeonjangBrowserFocusToolDescriptorIntegrationGate[];
};
export declare function evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton(input: {
    descriptor?: YeonjangBrowserFocusToolDescriptorSkeleton | undefined;
    registrationPrecondition: YeonjangBrowserFocusRegistrationPreconditionDecision;
    sideEffectMethodContractBound: boolean;
    preflight: YeonjangBrowserFocusPreflightDecision;
    commandSkeleton: YeonjangBrowserFocusCommandSkeletonIntegrationInput;
    focusedTargetObservationBackendReady: boolean;
}): YeonjangBrowserFocusToolDescriptorIntegrationSkeleton;
//# sourceMappingURL=yeonjang-browser-focus-tool-descriptor-integration-skeleton.d.ts.map