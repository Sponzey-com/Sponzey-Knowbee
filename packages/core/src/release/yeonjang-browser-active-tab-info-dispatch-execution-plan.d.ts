import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
import type { YeonjangBrowserActiveTabInfoLiveExecutionReceipt } from "./yeonjang-browser-active-tab-info-live-execution-receipt.js";
export type YeonjangBrowserActiveTabInfoDispatchExecutionPlanStep = "reconfirm_live_execution_receipt" | "reconfirm_target_surface_lock" | "prepare_rust_dispatch_input" | "collect_dispatch_result_reference" | "stop_before_skill_mapping_activation";
export type YeonjangBrowserActiveTabInfoDispatchExecutionPlanRollbackStep = "use_receipt_rollback_command_ref" | "restore_previous_runtime_binding" | "record_rollback_reference_only";
export type YeonjangBrowserActiveTabInfoDispatchExecutionPlanPostCheckStep = "use_receipt_post_execution_verification_plan_ref" | "verify_redacted_runtime_result" | "verify_final_and_product_log_boundaries";
export type YeonjangBrowserActiveTabInfoDispatchExecutionPlanBlockingReasonCode = "dispatch_execution_plan_receipt_not_ready" | "dispatch_execution_plan_transport_not_ready" | "dispatch_execution_plan_surface_lock_missing" | "dispatch_execution_plan_rollback_executor_unavailable" | "dispatch_execution_plan_post_check_executor_unavailable";
export interface YeonjangBrowserActiveTabInfoDispatchExecutionPlanInput {
    liveExecutionReceipt: YeonjangBrowserActiveTabInfoLiveExecutionReceipt;
    dispatchTransportReady: boolean;
    targetSurfaceLockAcquired: boolean;
    rollbackExecutorAvailable: boolean;
    postCheckExecutorAvailable: boolean;
    cancelRequested: boolean;
}
export type YeonjangBrowserActiveTabInfoDispatchExecutionPlan = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-plan.v1";
    method: "browser.active_tab_info";
    state: "planned" | "blocked" | "cancelled";
    reasonCode: "active_tab_info_dispatch_execution_plan_ready" | "active_tab_info_dispatch_execution_plan_blocked" | "active_tab_info_dispatch_execution_plan_cancelled";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanBlockingReasonCode[];
    liveExecutionReceiptId: string;
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    orderedDispatchSteps: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanStep[];
    rollbackSteps: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanRollbackStep[];
    postCheckSteps: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanPostCheckStep[];
    dispatchNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    markUserGoalSucceededNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan(input: YeonjangBrowserActiveTabInfoDispatchExecutionPlanInput): YeonjangBrowserActiveTabInfoDispatchExecutionPlan;
//# sourceMappingURL=yeonjang-browser-active-tab-info-dispatch-execution-plan.d.ts.map