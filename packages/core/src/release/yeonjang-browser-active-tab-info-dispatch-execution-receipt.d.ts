import type { YeonjangBrowserActiveTabInfoDispatchDryRunReceipt } from "./yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.js";
export type YeonjangBrowserActiveTabInfoDispatchExecutionReceiptBlockingReasonCode = "dispatch_execution_receipt_dry_run_receipt_not_ready" | "dispatch_execution_receipt_operator_final_confirmation_missing" | "dispatch_execution_receipt_execution_ref_invalid" | "dispatch_execution_receipt_executed_at_invalid" | "dispatch_execution_receipt_surface_count_mismatch" | "dispatch_execution_receipt_redacted_result_ref_invalid";
export interface YeonjangBrowserActiveTabInfoDispatchExecutionReceiptInput {
    dispatchDryRunReceipt: YeonjangBrowserActiveTabInfoDispatchDryRunReceipt;
    operatorFinalDispatchConfirmation: boolean;
    dispatchExecutionRef: string;
    executedAt: string;
    targetSurfaceCount: number;
    postDispatchRedactedResultRef: string;
}
export type YeonjangBrowserActiveTabInfoDispatchExecutionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-receipt.v1";
    method: "browser.active_tab_info";
    status: "dispatch_execution_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_dispatch_execution_receipt_ready" | "active_tab_info_dispatch_execution_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoDispatchExecutionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        dispatchExecutionReceiptId: string;
        dispatchDryRunReceiptId: string;
        liveExecutionReceiptId: string;
        targetSurfaceCount: number;
        executedAt: string;
        postDispatchRedactedResultRef: string;
    }>;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    markUserGoalSucceededNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoDispatchExecutionReceipt(input: YeonjangBrowserActiveTabInfoDispatchExecutionReceiptInput): YeonjangBrowserActiveTabInfoDispatchExecutionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-dispatch-execution-receipt.d.ts.map