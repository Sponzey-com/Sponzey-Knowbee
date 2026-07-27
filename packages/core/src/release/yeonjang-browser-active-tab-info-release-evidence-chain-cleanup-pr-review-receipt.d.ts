import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceiptInput = {
    readonly cleanupPrChecklist: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist;
    readonly operatorReviewRef?: string;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.v1";
    readonly method: "browser.active_tab_info";
    readonly receiptStatus: "accepted" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_accepted" | "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_checklist_not_ready" | "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_review_ref_invalid";
    readonly reviewDecision: "cleanup_pr_preparation_accepted" | "complete_cleanup_pr_checklist" | "provide_safe_operator_review_ref";
    readonly reviewedChecklistStatus: "ready" | "blocked";
    readonly nextAllowedAction: "prepare_cleanup_branch_after_review" | "complete_cleanup_pr_checklist" | "provide_safe_operator_review_ref";
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceiptInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.d.ts.map