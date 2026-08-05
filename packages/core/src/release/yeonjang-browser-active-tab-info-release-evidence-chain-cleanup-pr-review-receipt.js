const SAFE_OPERATOR_REVIEW_REF = /^cleanup-pr-review:active-tab-info:operator-accepted:[a-z0-9][a-z0-9:-]{0,96}$/u;
function blocked(reasonCode, reviewDecision, reviewedChecklistStatus, nextAllowedAction) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.v1",
        method: "browser.active_tab_info",
        receiptStatus: "blocked",
        reasonCode,
        reviewDecision,
        reviewedChecklistStatus,
        nextAllowedAction,
        deleteCodeNow: false,
        modifyPackageNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt(input) {
    if (input.cleanupPrChecklist.checklistStatus !== "ready") {
        return blocked("active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_checklist_not_ready", "complete_cleanup_pr_checklist", "blocked", "complete_cleanup_pr_checklist");
    }
    const operatorReviewRef = input.operatorReviewRef?.trim() ?? "";
    if (!SAFE_OPERATOR_REVIEW_REF.test(operatorReviewRef)) {
        return blocked("active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_review_ref_invalid", "provide_safe_operator_review_ref", "ready", "provide_safe_operator_review_ref");
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.v1",
        method: "browser.active_tab_info",
        receiptStatus: "accepted",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_accepted",
        reviewDecision: "cleanup_pr_preparation_accepted",
        reviewedChecklistStatus: "ready",
        nextAllowedAction: "prepare_cleanup_branch_after_review",
        deleteCodeNow: false,
        modifyPackageNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.js.map