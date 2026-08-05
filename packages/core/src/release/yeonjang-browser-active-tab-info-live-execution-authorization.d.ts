import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
import type { YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt } from "./yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.js";
export type YeonjangBrowserActiveTabInfoLiveExecutionAuthorizationBlockingReasonCode = "live_execution_authorization_dry_run_receipt_not_ready" | "live_execution_authorization_operator_proof_required" | "live_execution_authorization_operator_proof_unsafe" | "live_execution_authorization_target_surfaces_required" | "live_execution_authorization_surface_count_mismatch" | "live_execution_authorization_rollback_emergency_acknowledgement_required" | "live_execution_authorization_post_execution_verification_acknowledgement_required" | "live_execution_authorization_authorized_at_invalid" | "live_execution_authorization_expires_at_invalid" | "live_execution_authorization_expired";
export interface YeonjangBrowserActiveTabInfoLiveExecutionAuthorizationInput {
    dryRunReceipt: YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt;
    operatorFinalLiveAuthorizationProof: string;
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    rollbackEmergencyCommandAcknowledged: boolean;
    postExecutionVerificationAcknowledged: boolean;
    authorizedAt: string;
    expiresAt: string;
}
export interface YeonjangBrowserActiveTabInfoLiveExecutionAuthorizationOptions {
    now: Date;
}
export type YeonjangBrowserActiveTabInfoLiveExecutionAuthorization = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-authorization.v1";
    method: "browser.active_tab_info";
    status: "live_execution_authorization_ready" | "blocked";
    reasonCode: "active_tab_info_live_execution_authorization_ready" | "active_tab_info_live_execution_authorization_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoLiveExecutionAuthorizationBlockingReasonCode[];
    authorization?: Readonly<{
        authorizationRef: string;
        dryRunReceiptId: string;
        targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
        rollbackEmergencyCommandAcknowledged: true;
        postExecutionVerificationAcknowledged: true;
        authorizedAt: string;
        expiresAt: string;
    }>;
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    createLiveExecutionReceiptNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoLiveExecutionAuthorization(input: YeonjangBrowserActiveTabInfoLiveExecutionAuthorizationInput, options: YeonjangBrowserActiveTabInfoLiveExecutionAuthorizationOptions): YeonjangBrowserActiveTabInfoLiveExecutionAuthorization;
//# sourceMappingURL=yeonjang-browser-active-tab-info-live-execution-authorization.d.ts.map