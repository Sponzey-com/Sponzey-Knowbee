const ORDERED_STEPS = Object.freeze([
    "confirm_runtime_change_authorization_scope",
    "prepare_target_surface_change_plan",
    "stage_rollback_commands",
    "define_post_check_evidence_collection",
    "stop_before_runtime_binding_mutation",
]);
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-change-skeleton.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        targetSurfaces: Object.freeze([...input.targetSurfaces]),
        orderedSteps: ORDERED_STEPS,
        rollbackCommandPlan: Object.freeze([...input.rollbackCommandPlan]),
        postCheckEvidenceRequirements: Object.freeze([...input.postCheckEvidenceRequirements]),
        ...(input.failureRecoveryRoute === undefined
            ? {}
            : { failureRecoveryRoute: input.failureRecoveryRoute }),
        executeNow: false,
        addRustDispatchNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton(input) {
    const blockingReasonCodes = [];
    if (input.bridgeReadiness.status !== "ready_for_separate_runtime_change") {
        blockingReasonCodes.push("runtime_change_skeleton_bridge_not_ready");
    }
    if (input.targetSurfaces.length === 0) {
        blockingReasonCodes.push("runtime_change_skeleton_target_surfaces_required");
    }
    if (input.rollbackCommandPlan.length === 0) {
        blockingReasonCodes.push("runtime_change_skeleton_rollback_command_plan_required");
    }
    if (input.postCheckEvidenceRequirements.length === 0) {
        blockingReasonCodes.push("runtime_change_skeleton_post_check_evidence_required");
    }
    if (input.failureRecoveryRoute === undefined) {
        blockingReasonCodes.push("runtime_change_skeleton_failure_recovery_route_required");
    }
    if (blockingReasonCodes.length > 0) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_runtime_change_skeleton_blocked",
            targetSurfaces: input.targetSurfaces,
            rollbackCommandPlan: input.rollbackCommandPlan,
            postCheckEvidenceRequirements: input.postCheckEvidenceRequirements,
            ...(input.failureRecoveryRoute === undefined
                ? {}
                : { failureRecoveryRoute: input.failureRecoveryRoute }),
            blockingReasonCodes,
        });
    }
    return baseResult({
        status: "runtime_change_skeleton_ready",
        reasonCode: "active_tab_info_runtime_change_skeleton_ready",
        targetSurfaces: input.targetSurfaces,
        rollbackCommandPlan: input.rollbackCommandPlan,
        postCheckEvidenceRequirements: input.postCheckEvidenceRequirements,
        failureRecoveryRoute: input.failureRecoveryRoute,
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-change-skeleton.js.map