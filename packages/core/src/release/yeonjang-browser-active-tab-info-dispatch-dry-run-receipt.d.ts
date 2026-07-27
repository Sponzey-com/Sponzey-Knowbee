import type { YeonjangBrowserActiveTabInfoDispatchExecutionPlan } from "./yeonjang-browser-active-tab-info-dispatch-execution-plan.js";
export type YeonjangBrowserActiveTabInfoDispatchDryRunReceiptBlockingReasonCode = "dispatch_dry_run_receipt_plan_not_planned" | "dispatch_dry_run_receipt_adapter_dry_run_id_invalid" | "dispatch_dry_run_receipt_surface_count_mismatch" | "dispatch_dry_run_receipt_rollback_dry_run_id_invalid" | "dispatch_dry_run_receipt_post_check_dry_run_id_invalid";
export interface YeonjangBrowserActiveTabInfoDispatchDryRunReceiptInput {
    dispatchExecutionPlan: YeonjangBrowserActiveTabInfoDispatchExecutionPlan;
    dispatchAdapterDryRunId: string;
    expectedSurfaceCount: number;
    rollbackDryRunId: string;
    postCheckDryRunId: string;
}
export type YeonjangBrowserActiveTabInfoDispatchDryRunReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.v1";
    method: "browser.active_tab_info";
    status: "dispatch_dry_run_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_dispatch_dry_run_receipt_ready" | "active_tab_info_dispatch_dry_run_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoDispatchDryRunReceiptBlockingReasonCode[];
    dispatchDryRunReceiptId: string;
    liveExecutionReceiptId: string;
    targetSurfaceCount: number;
    dispatchAdapterDryRunStatus: "passed" | "failed";
    rollbackDryRunStatus: "passed" | "failed";
    postCheckDryRunStatus: "passed" | "failed";
    dispatchNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    markUserGoalSucceededNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoDispatchDryRunReceipt(input: YeonjangBrowserActiveTabInfoDispatchDryRunReceiptInput): YeonjangBrowserActiveTabInfoDispatchDryRunReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.d.ts.map