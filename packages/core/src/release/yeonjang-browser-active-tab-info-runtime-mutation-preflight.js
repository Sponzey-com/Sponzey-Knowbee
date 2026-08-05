function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-preflight.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        targetSurfaces: Object.freeze([...input.targetSurfaces]),
        plannedMutationSurfaces: Object.freeze([...input.targetSurfaces]),
        rollbackCommandPlan: Object.freeze([...input.rollbackCommandPlan]),
        postCheckEvidenceRequirements: Object.freeze([...input.postCheckEvidenceRequirements]),
        executeNow: false,
        addRustDispatchNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoRuntimeMutationPreflight(input) {
    const blockingReasonCodes = [];
    if (input.runtimeChangeSkeleton.status !== "runtime_change_skeleton_ready") {
        blockingReasonCodes.push("runtime_mutation_preflight_skeleton_not_ready");
    }
    if (!input.productionExposureClosed) {
        blockingReasonCodes.push("runtime_mutation_preflight_production_exposure_open");
    }
    if (!input.rollbackCommandAvailable) {
        blockingReasonCodes.push("runtime_mutation_preflight_rollback_command_unavailable");
    }
    if (!input.postCheckCollectorAvailable) {
        blockingReasonCodes.push("runtime_mutation_preflight_post_check_collector_unavailable");
    }
    if (!input.finalProductLogBoundaryReady) {
        blockingReasonCodes.push("runtime_mutation_preflight_final_product_log_boundary_missing");
    }
    if (blockingReasonCodes.length > 0) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_runtime_mutation_preflight_blocked",
            blockingReasonCodes,
            targetSurfaces: input.runtimeChangeSkeleton.targetSurfaces,
            rollbackCommandPlan: input.runtimeChangeSkeleton.rollbackCommandPlan,
            postCheckEvidenceRequirements: input.runtimeChangeSkeleton.postCheckEvidenceRequirements,
        });
    }
    return baseResult({
        status: "mutation_preflight_ready",
        reasonCode: "active_tab_info_runtime_mutation_preflight_ready",
        targetSurfaces: input.runtimeChangeSkeleton.targetSurfaces,
        rollbackCommandPlan: input.runtimeChangeSkeleton.rollbackCommandPlan,
        postCheckEvidenceRequirements: input.runtimeChangeSkeleton.postCheckEvidenceRequirements,
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-mutation-preflight.js.map