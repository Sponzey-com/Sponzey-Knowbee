import type { YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan } from "./yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.js";
export type YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptBlockingReasonCode = "runtime_mutation_dry_run_receipt_executor_plan_not_planned" | "runtime_mutation_dry_run_receipt_executor_dry_run_id_invalid" | "runtime_mutation_dry_run_receipt_surface_count_mismatch" | "runtime_mutation_dry_run_receipt_rollback_dry_run_id_invalid" | "runtime_mutation_dry_run_receipt_post_check_dry_run_id_invalid";
export interface YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptInput {
    runtimeMutationExecutorPlan: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan;
    runtimeExecutorDryRunId: string;
    expectedMutationSurfaceCount: number;
    rollbackDryRunId: string;
    postCheckDryRunId: string;
}
export type YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.v1";
    method: "browser.active_tab_info";
    status: "dry_run_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_runtime_mutation_dry_run_receipt_ready" | "active_tab_info_runtime_mutation_dry_run_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptBlockingReasonCode[];
    dryRunReceiptId: string;
    mutationSurfaceCount: number;
    rollbackDryRunStatus: "passed" | "failed";
    postCheckDryRunStatus: "passed" | "failed";
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    createLiveExecutionReceiptNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt(input: YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptInput): YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.d.ts.map