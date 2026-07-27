import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceiptInput = {
    readonly cleanupDeletionCandidatePlan: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan;
    readonly operatorReviewReceiptRef?: string;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.v1";
    readonly method: "browser.active_tab_info";
    readonly receiptStatus: "accepted" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_accepted" | "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_candidate_plan_not_ready" | "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_missing_receipt_ref" | "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_receipt_ref_invalid";
    readonly reviewedCandidatePlanStatus: "ready" | "blocked";
    readonly reviewDecision: "manual_cleanup_deletion_review_accepted" | "complete_cleanup_deletion_candidate_plan";
    readonly nextAllowedAction: "prepare_cleanup_deletion_execution_admission_after_review_receipt" | "complete_cleanup_deletion_candidate_plan" | "provide_cleanup_deletion_review_receipt_ref";
    readonly runGitNow: false;
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly createBranchNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceiptInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.d.ts.map