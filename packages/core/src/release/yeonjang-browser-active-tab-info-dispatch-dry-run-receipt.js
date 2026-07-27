import { createHash } from "node:crypto";
const SAFE_DRY_RUN_ID_PATTERN = /^dry-run:[a-z0-9._:-]+$/u;
function isSafeDryRunId(value) {
    return SAFE_DRY_RUN_ID_PATTERN.test(value);
}
function buildDispatchDryRunReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.dispatchAdapterDryRunId,
        input.rollbackDryRunId,
        input.postCheckDryRunId,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `dispatch-dry-run-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        dispatchDryRunReceiptId: input.dispatchDryRunReceiptId,
        liveExecutionReceiptId: input.liveExecutionReceiptId,
        targetSurfaceCount: input.targetSurfaceCount,
        dispatchAdapterDryRunStatus: input.dispatchAdapterDryRunStatus,
        rollbackDryRunStatus: input.rollbackDryRunStatus,
        postCheckDryRunStatus: input.postCheckDryRunStatus,
        dispatchNow: false,
        addRustDispatchNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
        markUserGoalSucceededNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoDispatchDryRunReceipt(input) {
    const blockingReasonCodes = [];
    if (input.dispatchExecutionPlan.state !== "planned") {
        blockingReasonCodes.push("dispatch_dry_run_receipt_plan_not_planned");
    }
    if (!isSafeDryRunId(input.dispatchAdapterDryRunId)) {
        blockingReasonCodes.push("dispatch_dry_run_receipt_adapter_dry_run_id_invalid");
    }
    if (input.expectedSurfaceCount !== input.dispatchExecutionPlan.targetSurfaces.length) {
        blockingReasonCodes.push("dispatch_dry_run_receipt_surface_count_mismatch");
    }
    if (!isSafeDryRunId(input.rollbackDryRunId)) {
        blockingReasonCodes.push("dispatch_dry_run_receipt_rollback_dry_run_id_invalid");
    }
    if (!isSafeDryRunId(input.postCheckDryRunId)) {
        blockingReasonCodes.push("dispatch_dry_run_receipt_post_check_dry_run_id_invalid");
    }
    const dispatchDryRunReceiptId = blockingReasonCodes.length > 0
        ? "dispatch-dry-run-receipt:browser.active_tab_info:blocked"
        : buildDispatchDryRunReceiptId({
            dispatchAdapterDryRunId: input.dispatchAdapterDryRunId,
            rollbackDryRunId: input.rollbackDryRunId,
            postCheckDryRunId: input.postCheckDryRunId,
        });
    if (blockingReasonCodes.length > 0) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_dispatch_dry_run_receipt_blocked",
            blockingReasonCodes,
            dispatchDryRunReceiptId,
            liveExecutionReceiptId: input.dispatchExecutionPlan.liveExecutionReceiptId,
            targetSurfaceCount: input.dispatchExecutionPlan.targetSurfaces.length,
            dispatchAdapterDryRunStatus: "failed",
            rollbackDryRunStatus: isSafeDryRunId(input.rollbackDryRunId) ? "passed" : "failed",
            postCheckDryRunStatus: isSafeDryRunId(input.postCheckDryRunId) ? "passed" : "failed",
        });
    }
    return baseResult({
        status: "dispatch_dry_run_receipt_ready",
        reasonCode: "active_tab_info_dispatch_dry_run_receipt_ready",
        dispatchDryRunReceiptId,
        liveExecutionReceiptId: input.dispatchExecutionPlan.liveExecutionReceiptId,
        targetSurfaceCount: input.expectedSurfaceCount,
        dispatchAdapterDryRunStatus: "passed",
        rollbackDryRunStatus: "passed",
        postCheckDryRunStatus: "passed",
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.js.map