const SAFE_OPERATOR_EXECUTION_ADMISSION_REF = /^cleanup-branch-execution-admission:active-tab-info:operator-accepted:[a-z0-9][a-z0-9:-]{0,96}$/u;
function blocked(input) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1",
        method: "browser.active_tab_info",
        admissionStatus: "blocked",
        reasonCode: input.reasonCode,
        reviewedPlanStatus: input.reviewedPlanStatus,
        admissionDecision: input.admissionDecision,
        requiredExecutionBoundaries: [],
        nextAllowedAction: input.nextAllowedAction,
        runGitNow: false,
        deleteCodeNow: false,
        modifyPackageNow: false,
        createBranchNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission(input) {
    if (input.cleanupBranchPreparationPlan.planStatus !== "ready" ||
        input.cleanupBranchPreparationPlan.nextAllowedAction !== "create_separate_cleanup_branch_manually") {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_plan_not_ready",
            reviewedPlanStatus: input.cleanupBranchPreparationPlan.planStatus,
            admissionDecision: "complete_cleanup_branch_preparation_plan",
            nextAllowedAction: "complete_cleanup_branch_preparation_plan",
        });
    }
    const operatorExecutionAdmissionRef = input.operatorExecutionAdmissionRef?.trim() ?? "";
    if (!SAFE_OPERATOR_EXECUTION_ADMISSION_REF.test(operatorExecutionAdmissionRef)) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_ref_invalid",
            reviewedPlanStatus: "ready",
            admissionDecision: "provide_safe_cleanup_branch_execution_admission_ref",
            nextAllowedAction: "provide_safe_cleanup_branch_execution_admission_ref",
        });
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1",
        method: "browser.active_tab_info",
        admissionStatus: "accepted",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted",
        reviewedPlanStatus: "ready",
        admissionDecision: "manual_cleanup_branch_execution_admitted",
        requiredExecutionBoundaries: [
            "Use a separate Tidy First cleanup branch only after operator admission.",
            "Do not delete reviewed candidates, mutate release packages, or enable production binding in this admission step.",
            "Record any later cleanup execution in a separate auditable task with its own verification receipt.",
        ],
        nextAllowedAction: "prepare_cleanup_deletion_candidate_after_branch_admission",
        runGitNow: false,
        deleteCodeNow: false,
        modifyPackageNow: false,
        createBranchNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.js.map