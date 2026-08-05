import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
export type YeonjangBrowserActiveTabInfoHighRiskAuthorizationScope = "runtime_activation_executor";
export interface YeonjangBrowserActiveTabInfoHighRiskAuthorizationInput {
    operatorIdentityProof: string;
    authorizationScope: YeonjangBrowserActiveTabInfoHighRiskAuthorizationScope;
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    rollbackAcknowledged: boolean;
    postCheckAcknowledged: boolean;
    auditReference: string;
    authorizedAt: string;
    expiresAt: string;
}
export interface YeonjangBrowserActiveTabInfoHighRiskAuthorizationOptions {
    now: Date;
}
export type YeonjangBrowserActiveTabInfoHighRiskAuthorizationBlockingReasonCode = "high_risk_authorization_operator_identity_proof_required" | "high_risk_authorization_operator_identity_proof_unsafe" | "high_risk_authorization_scope_required" | "high_risk_authorization_target_surfaces_required" | "high_risk_authorization_rollback_acknowledgement_required" | "high_risk_authorization_post_check_acknowledgement_required" | "high_risk_authorization_audit_reference_required" | "high_risk_authorization_audit_reference_unsafe" | "high_risk_authorization_authorized_at_invalid" | "high_risk_authorization_expires_at_invalid" | "high_risk_authorization_expired";
export type YeonjangBrowserActiveTabInfoHighRiskAuthorization = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-high-risk-authorization.v1";
    method: "browser.active_tab_info";
    status: "accepted" | "rejected";
    reasonCode: "active_tab_info_high_risk_authorization_accepted" | "active_tab_info_high_risk_authorization_invalid";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoHighRiskAuthorizationBlockingReasonCode[];
    authorization?: Readonly<{
        authorizationScope: YeonjangBrowserActiveTabInfoHighRiskAuthorizationScope;
        targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
        rollbackAcknowledged: true;
        postCheckAcknowledged: true;
        auditReference: string;
        authorizedAt: string;
        expiresAt: string;
    }>;
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoHighRiskAuthorization(input: YeonjangBrowserActiveTabInfoHighRiskAuthorizationInput, options: YeonjangBrowserActiveTabInfoHighRiskAuthorizationOptions): YeonjangBrowserActiveTabInfoHighRiskAuthorization;
//# sourceMappingURL=yeonjang-browser-active-tab-info-high-risk-authorization.d.ts.map