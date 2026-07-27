import { createHash } from "node:crypto";
const DISPATCH_EXECUTION_REF_PATTERN = /^dispatch-execution:[a-z0-9._:-]+$/u;
const REDACTED_RESULT_REF_PATTERN = /^post-dispatch-result:[a-z0-9._:-]+$/u;
function parseDate(value) {
    if (!value.trim())
        return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
function buildDispatchExecutionReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.dispatchDryRunReceiptId,
        input.dispatchExecutionRef,
        input.executedAt,
        input.postDispatchRedactedResultRef,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `dispatch-execution-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-receipt.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
        markUserGoalSucceededNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoDispatchExecutionReceipt(input) {
    const blockingReasonCodes = [];
    if (input.dispatchDryRunReceipt.status !== "dispatch_dry_run_receipt_ready") {
        blockingReasonCodes.push("dispatch_execution_receipt_dry_run_receipt_not_ready");
    }
    if (!input.operatorFinalDispatchConfirmation) {
        blockingReasonCodes.push("dispatch_execution_receipt_operator_final_confirmation_missing");
    }
    if (!DISPATCH_EXECUTION_REF_PATTERN.test(input.dispatchExecutionRef)) {
        blockingReasonCodes.push("dispatch_execution_receipt_execution_ref_invalid");
    }
    const executedAt = parseDate(input.executedAt);
    if (executedAt === undefined) {
        blockingReasonCodes.push("dispatch_execution_receipt_executed_at_invalid");
    }
    if (input.targetSurfaceCount !== input.dispatchDryRunReceipt.targetSurfaceCount) {
        blockingReasonCodes.push("dispatch_execution_receipt_surface_count_mismatch");
    }
    if (!REDACTED_RESULT_REF_PATTERN.test(input.postDispatchRedactedResultRef)) {
        blockingReasonCodes.push("dispatch_execution_receipt_redacted_result_ref_invalid");
    }
    if (blockingReasonCodes.length > 0) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_dispatch_execution_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const normalizedExecutedAt = executedAt?.toISOString() ?? input.executedAt;
    return baseResult({
        status: "dispatch_execution_receipt_ready",
        reasonCode: "active_tab_info_dispatch_execution_receipt_ready",
        receipt: Object.freeze({
            dispatchExecutionReceiptId: buildDispatchExecutionReceiptId({
                dispatchDryRunReceiptId: input.dispatchDryRunReceipt.dispatchDryRunReceiptId,
                dispatchExecutionRef: input.dispatchExecutionRef,
                executedAt: normalizedExecutedAt,
                postDispatchRedactedResultRef: input.postDispatchRedactedResultRef,
            }),
            dispatchDryRunReceiptId: input.dispatchDryRunReceipt.dispatchDryRunReceiptId,
            liveExecutionReceiptId: input.dispatchDryRunReceipt.liveExecutionReceiptId,
            targetSurfaceCount: input.targetSurfaceCount,
            executedAt: normalizedExecutedAt,
            postDispatchRedactedResultRef: input.postDispatchRedactedResultRef,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-dispatch-execution-receipt.js.map