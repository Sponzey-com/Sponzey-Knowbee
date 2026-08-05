import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
import type { YeonjangBrowserActiveTabInfoLiveExecutionAuthorization } from "./yeonjang-browser-active-tab-info-live-execution-authorization.js";
export type YeonjangBrowserActiveTabInfoLiveExecutionReceiptBlockingReasonCode = "live_execution_receipt_authorization_not_ready" | "live_execution_receipt_target_instance_id_invalid" | "live_execution_receipt_runtime_config_snapshot_id_invalid" | "live_execution_receipt_window_starts_at_invalid" | "live_execution_receipt_window_expires_at_invalid" | "live_execution_receipt_window_order_invalid" | "live_execution_receipt_window_not_active" | "live_execution_receipt_authorization_expires_before_window" | "live_execution_receipt_rollback_command_ref_invalid" | "live_execution_receipt_post_execution_verification_plan_ref_invalid";
export interface YeonjangBrowserActiveTabInfoLiveExecutionReceiptInput {
    liveExecutionAuthorization: YeonjangBrowserActiveTabInfoLiveExecutionAuthorization;
    targetInstanceId: string;
    runtimeConfigSnapshotId: string;
    operatorExecutionWindow: Readonly<{
        startsAt: string;
        expiresAt: string;
    }>;
    rollbackCommandRef: string;
    postExecutionVerificationPlanRef: string;
}
export interface YeonjangBrowserActiveTabInfoLiveExecutionReceiptOptions {
    now: Date;
}
export type YeonjangBrowserActiveTabInfoLiveExecutionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-receipt.v1";
    method: "browser.active_tab_info";
    status: "live_execution_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_live_execution_receipt_ready" | "active_tab_info_live_execution_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoLiveExecutionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        liveExecutionReceiptId: string;
        authorizationRef: string;
        dryRunReceiptId: string;
        targetInstanceRef: string;
        targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
        runtimeConfigSnapshotId: string;
        executionWindow: Readonly<{
            startsAt: string;
            expiresAt: string;
        }>;
        rollbackCommandRef: string;
        postExecutionVerificationPlanRef: string;
    }>;
    dispatchNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    markUserGoalSucceededNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt(input: YeonjangBrowserActiveTabInfoLiveExecutionReceiptInput, options: YeonjangBrowserActiveTabInfoLiveExecutionReceiptOptions): YeonjangBrowserActiveTabInfoLiveExecutionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-live-execution-receipt.d.ts.map