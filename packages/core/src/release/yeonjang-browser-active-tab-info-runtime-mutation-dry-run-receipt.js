import { createHash } from "node:crypto";
const SAFE_DRY_RUN_ID_PATTERN = /^dry-run:[a-z0-9._:-]+$/u;
function isSafeDryRunId(value) {
    return SAFE_DRY_RUN_ID_PATTERN.test(value);
}
function buildDryRunReceiptId(input) {
    const hash = createHash("sha256")
        .update(input.runtimeExecutorDryRunId)
        .update("\n")
        .update(input.rollbackDryRunId)
        .update("\n")
        .update(input.postCheckDryRunId)
        .digest("hex")
        .slice(0, 3);
    return `dry-run-receipt:browser.active_tab_info:${hash}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        dryRunReceiptId: input.dryRunReceiptId,
        mutationSurfaceCount: input.mutationSurfaceCount,
        rollbackDryRunStatus: input.rollbackDryRunStatus,
        postCheckDryRunStatus: input.postCheckDryRunStatus,
        executeNow: false,
        addRustDispatchNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
        createLiveExecutionReceiptNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt(input) {
    const blockingReasonCodes = [];
    if (input.runtimeMutationExecutorPlan.state !== "planned") {
        blockingReasonCodes.push("runtime_mutation_dry_run_receipt_executor_plan_not_planned");
    }
    if (!isSafeDryRunId(input.runtimeExecutorDryRunId)) {
        blockingReasonCodes.push("runtime_mutation_dry_run_receipt_executor_dry_run_id_invalid");
    }
    if (input.expectedMutationSurfaceCount !==
        input.runtimeMutationExecutorPlan.mutationSurfaces.length) {
        blockingReasonCodes.push("runtime_mutation_dry_run_receipt_surface_count_mismatch");
    }
    if (!isSafeDryRunId(input.rollbackDryRunId)) {
        blockingReasonCodes.push("runtime_mutation_dry_run_receipt_rollback_dry_run_id_invalid");
    }
    if (!isSafeDryRunId(input.postCheckDryRunId)) {
        blockingReasonCodes.push("runtime_mutation_dry_run_receipt_post_check_dry_run_id_invalid");
    }
    const dryRunReceiptId = blockingReasonCodes.length > 0
        ? "dry-run-receipt:browser.active_tab_info:blocked"
        : buildDryRunReceiptId({
            runtimeExecutorDryRunId: input.runtimeExecutorDryRunId,
            rollbackDryRunId: input.rollbackDryRunId,
            postCheckDryRunId: input.postCheckDryRunId,
        });
    if (blockingReasonCodes.length > 0) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_runtime_mutation_dry_run_receipt_blocked",
            blockingReasonCodes,
            dryRunReceiptId,
            mutationSurfaceCount: input.runtimeMutationExecutorPlan.mutationSurfaces.length,
            rollbackDryRunStatus: input.runtimeMutationExecutorPlan.rollbackDryRunSummary,
            postCheckDryRunStatus: input.runtimeMutationExecutorPlan.postCheckDryRunSummary,
        });
    }
    return baseResult({
        status: "dry_run_receipt_ready",
        reasonCode: "active_tab_info_runtime_mutation_dry_run_receipt_ready",
        dryRunReceiptId,
        mutationSurfaceCount: input.expectedMutationSurfaceCount,
        rollbackDryRunStatus: input.runtimeMutationExecutorPlan.rollbackDryRunSummary,
        postCheckDryRunStatus: input.runtimeMutationExecutorPlan.postCheckDryRunSummary,
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.js.map