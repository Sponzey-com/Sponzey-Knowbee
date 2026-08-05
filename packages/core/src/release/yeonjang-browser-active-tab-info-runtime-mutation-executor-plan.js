const ORDERED_EXECUTION_STEPS = Object.freeze([
    "reconfirm_mutation_surface_lock",
    "apply_runtime_binding_change",
    "collect_post_check_evidence",
    "stop_before_default_live_smoke",
]);
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.v1",
        method: "browser.active_tab_info",
        state: input.state,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        mutationSurfaces: Object.freeze([...input.mutationSurfaces]),
        orderedExecutionSteps: ORDERED_EXECUTION_STEPS,
        rollbackDryRunSummary: input.rollbackDryRunSummary,
        postCheckDryRunSummary: input.postCheckDryRunSummary,
        executeNow: false,
        addRustDispatchNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan(input) {
    if (input.cancelRequested) {
        return baseResult({
            state: "cancelled",
            reasonCode: "active_tab_info_runtime_mutation_executor_plan_cancelled",
            mutationSurfaces: input.runtimeMutationPreflight.plannedMutationSurfaces,
            rollbackDryRunSummary: input.rollbackCommandDryRunResult,
            postCheckDryRunSummary: input.postCheckCollectorDryRunResult,
        });
    }
    const blockingReasonCodes = [];
    if (input.runtimeMutationPreflight.status !== "mutation_preflight_ready") {
        blockingReasonCodes.push("runtime_mutation_executor_preflight_not_ready");
    }
    if (!input.operatorFinalConfirmation) {
        blockingReasonCodes.push("runtime_mutation_executor_operator_final_confirmation_missing");
    }
    if (input.rollbackCommandDryRunResult !== "passed") {
        blockingReasonCodes.push("runtime_mutation_executor_rollback_dry_run_failed");
    }
    if (input.postCheckCollectorDryRunResult !== "passed") {
        blockingReasonCodes.push("runtime_mutation_executor_post_check_dry_run_failed");
    }
    if (!input.mutationSurfaceLockAcquired) {
        blockingReasonCodes.push("runtime_mutation_executor_surface_lock_missing");
    }
    if (blockingReasonCodes.length > 0) {
        return baseResult({
            state: "blocked",
            reasonCode: "active_tab_info_runtime_mutation_executor_plan_blocked",
            blockingReasonCodes,
            mutationSurfaces: input.runtimeMutationPreflight.plannedMutationSurfaces,
            rollbackDryRunSummary: input.rollbackCommandDryRunResult,
            postCheckDryRunSummary: input.postCheckCollectorDryRunResult,
        });
    }
    return baseResult({
        state: "planned",
        reasonCode: "active_tab_info_runtime_mutation_executor_plan_ready",
        mutationSurfaces: input.runtimeMutationPreflight.plannedMutationSurfaces,
        rollbackDryRunSummary: input.rollbackCommandDryRunResult,
        postCheckDryRunSummary: input.postCheckCollectorDryRunResult,
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.js.map