import type { YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection } from "./yeonjang-browser-active-tab-info-live-enable-prerequisites.js";
export type YeonjangBrowserActiveTabInfoActivationTargetPlatform = "macos" | "windows" | "linux";
export type YeonjangBrowserActiveTabInfoActivationScope = "rust_live_handler" | "skill_mapping" | "production_binding" | "default_live_smoke";
export interface YeonjangBrowserActiveTabInfoActivationRequestInput {
    prerequisiteProjection: YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection;
    manualApprovalReference: string;
    targetPlatform: YeonjangBrowserActiveTabInfoActivationTargetPlatform;
    operatorIdentityProof: string;
    rollbackRequirement: string;
    explicitEnableScope: readonly YeonjangBrowserActiveTabInfoActivationScope[];
}
export type YeonjangBrowserActiveTabInfoActivationRequestBlockingReasonCode = "activation_request_prerequisites_not_ready" | "activation_request_manual_approval_reference_required" | "activation_request_target_platform_required" | "activation_request_operator_identity_proof_required" | "activation_request_rollback_requirement_required" | "activation_request_explicit_enable_scope_required";
export interface YeonjangBrowserActiveTabInfoActivationRequestPayload {
    manualApprovalReference: string;
    targetPlatform: YeonjangBrowserActiveTabInfoActivationTargetPlatform;
    operatorIdentityProof: string;
    rollbackRequirement: string;
    explicitEnableScope: readonly YeonjangBrowserActiveTabInfoActivationScope[];
}
export type YeonjangBrowserActiveTabInfoActivationRequest = {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-request.v1";
    method: "browser.active_tab_info";
    status: "activation_request_ready";
    blockingReasonCodes: readonly [];
    activationRequest: Readonly<YeonjangBrowserActiveTabInfoActivationRequestPayload>;
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
} | {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-request.v1";
    method: "browser.active_tab_info";
    status: "blocked";
    blockingReasonCodes: readonly YeonjangBrowserActiveTabInfoActivationRequestBlockingReasonCode[];
    activationRequest?: undefined;
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoActivationRequest(input: YeonjangBrowserActiveTabInfoActivationRequestInput): YeonjangBrowserActiveTabInfoActivationRequest;
//# sourceMappingURL=yeonjang-browser-active-tab-info-activation-request.d.ts.map