const SAFE_OPERATOR_REVIEW_RECEIPT_REF = /^cleanup-deletion-review-receipt:active-tab-info:sanitized:[a-z0-9][a-z0-9:-]{0,96}$/u;
function blocked(input) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.v1",
        method: "browser.active_tab_info",
        receiptStatus: "blocked",
        reasonCode: input.reasonCode,
        reviewedCandidatePlanStatus: input.reviewedCandidatePlanStatus,
        reviewDecision: "complete_cleanup_deletion_candidate_plan",
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
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt(input) {
    if (input.cleanupDeletionCandidatePlan.candidatePlanStatus !== "ready" ||
        input.cleanupDeletionCandidatePlan.nextAllowedAction !== "review_cleanup_deletion_candidate_plan") {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_candidate_plan_not_ready",
            reviewedCandidatePlanStatus: input.cleanupDeletionCandidatePlan.candidatePlanStatus,
            nextAllowedAction: "complete_cleanup_deletion_candidate_plan",
        });
    }
    const receiptRef = input.operatorReviewReceiptRef?.trim() ?? "";
    if (receiptRef.length === 0) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_missing_receipt_ref",
            reviewedCandidatePlanStatus: "ready",
            nextAllowedAction: "provide_cleanup_deletion_review_receipt_ref",
        });
    }
    if (!SAFE_OPERATOR_REVIEW_RECEIPT_REF.test(receiptRef)) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_receipt_ref_invalid",
            reviewedCandidatePlanStatus: "ready",
            nextAllowedAction: "provide_cleanup_deletion_review_receipt_ref",
        });
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.v1",
        method: "browser.active_tab_info",
        receiptStatus: "accepted",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_accepted",
        reviewedCandidatePlanStatus: "ready",
        reviewDecision: "manual_cleanup_deletion_review_accepted",
        nextAllowedAction: "prepare_cleanup_deletion_execution_admission_after_review_receipt",
        runGitNow: false,
        deleteCodeNow: false,
        modifyPackageNow: false,
        createBranchNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.js.map