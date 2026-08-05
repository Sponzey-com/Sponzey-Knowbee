const ORDERED_DISPATCH_STEPS = Object.freeze([
    "reconfirm_live_execution_receipt",
    "reconfirm_target_surface_lock",
    "prepare_rust_dispatch_input",
    "collect_dispatch_result_reference",
    "stop_before_skill_mapping_activation",
]);
const ROLLBACK_STEPS = Object.freeze([
    "use_receipt_rollback_command_ref",
    "restore_previous_runtime_binding",
    "record_rollback_reference_only",
]);
const POST_CHECK_STEPS = Object.freeze([
    "use_receipt_post_execution_verification_plan_ref",
    "verify_redacted_runtime_result",
    "verify_final_and_product_log_boundaries",
]);
function receiptId(input) {
    return input.receipt?.liveExecutionReceiptId ?? "live-execution-receipt:browser.active_tab_info:blocked";
}
function targetSurfaces(input) {
    return input.receipt?.targetSurfaces ?? [];
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-plan.v1",
        method: "browser.active_tab_info",
        state: input.state,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        liveExecutionReceiptId: input.liveExecutionReceiptId,
        targetSurfaces: Object.freeze([...input.targetSurfaces]),
        orderedDispatchSteps: ORDERED_DISPATCH_STEPS,
        rollbackSteps: ROLLBACK_STEPS,
        postCheckSteps: POST_CHECK_STEPS,
        dispatchNow: false,
        addRustDispatchNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
        markUserGoalSucceededNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan(input) {
    const liveExecutionReceiptId = receiptId(input.liveExecutionReceipt);
    const surfaces = targetSurfaces(input.liveExecutionReceipt);
    if (input.cancelRequested) {
        return baseResult({
            state: "cancelled",
            reasonCode: "active_tab_info_dispatch_execution_plan_cancelled",
            liveExecutionReceiptId,
            targetSurfaces: surfaces,
        });
    }
    const blockingReasonCodes = [];
    if (input.liveExecutionReceipt.status !== "live_execution_receipt_ready") {
        blockingReasonCodes.push("dispatch_execution_plan_receipt_not_ready");
    }
    if (!input.dispatchTransportReady) {
        blockingReasonCodes.push("dispatch_execution_plan_transport_not_ready");
    }
    if (!input.targetSurfaceLockAcquired) {
        blockingReasonCodes.push("dispatch_execution_plan_surface_lock_missing");
    }
    if (!input.rollbackExecutorAvailable) {
        blockingReasonCodes.push("dispatch_execution_plan_rollback_executor_unavailable");
    }
    if (!input.postCheckExecutorAvailable) {
        blockingReasonCodes.push("dispatch_execution_plan_post_check_executor_unavailable");
    }
    if (blockingReasonCodes.length > 0) {
        return baseResult({
            state: "blocked",
            reasonCode: "active_tab_info_dispatch_execution_plan_blocked",
            blockingReasonCodes,
            liveExecutionReceiptId,
            targetSurfaces: surfaces,
        });
    }
    return baseResult({
        state: "planned",
        reasonCode: "active_tab_info_dispatch_execution_plan_ready",
        liveExecutionReceiptId,
        targetSurfaces: surfaces,
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-dispatch-execution-plan.js.map