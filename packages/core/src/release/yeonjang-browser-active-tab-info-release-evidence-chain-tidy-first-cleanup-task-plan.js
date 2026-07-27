const CLEANUP_TASK_REF = /^tidy-first-cleanup-task:active-tab-info:approved:[a-z0-9][a-z0-9:-]{0,96}$/u;
function blocked(reasonCode) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.v1",
        method: "browser.active_tab_info",
        taskPlanStatus: "blocked",
        reasonCode,
        cleanupTaskCount: 0,
        cleanupTaskRefs: [],
        nextAllowedAction: "complete_cleanup_approval",
        executeDeletionNow: false,
        modifyPackageNow: false,
        requiresSeparateCommit: true,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan(input) {
    if (input.cleanupApprovalGate.approvalStatus !== "ready_for_tidy_first_cleanup") {
        return blocked("active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_approval_not_ready");
    }
    const cleanupTaskRefs = input.cleanupTaskRefs.map((item) => item.trim());
    if (cleanupTaskRefs.length !== input.cleanupApprovalGate.approvedCandidateCount ||
        cleanupTaskRefs.some((item) => !CLEANUP_TASK_REF.test(item))) {
        return blocked("active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_ref_invalid");
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.v1",
        method: "browser.active_tab_info",
        taskPlanStatus: "ready",
        reasonCode: "active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_ready",
        cleanupTaskCount: cleanupTaskRefs.length,
        cleanupTaskRefs,
        nextAllowedAction: "run_separate_tidy_first_cleanup_task",
        executeDeletionNow: false,
        modifyPackageNow: false,
        requiresSeparateCommit: true,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.js.map