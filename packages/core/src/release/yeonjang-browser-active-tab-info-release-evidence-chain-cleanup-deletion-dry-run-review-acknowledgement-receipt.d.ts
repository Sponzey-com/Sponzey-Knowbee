import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceiptInput = {
    readonly cleanupDeletionDryRunReceipt: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt;
    readonly sanitizedOperatorAcknowledgementRef?: string;
    readonly productLogEvidenceRef?: string;
    readonly operatorReviewAcknowledgementRef?: string;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.v1";
    readonly method: "browser.active_tab_info";
    readonly receiptStatus: "accepted" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_accepted" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_dry_run_not_ready" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_missing_operator_acknowledgement_ref" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_operator_acknowledgement_ref_invalid" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_missing_product_log_evidence_ref" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_product_log_evidence_ref_invalid" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_missing_operator_review_acknowledgement_ref" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_operator_review_acknowledgement_ref_invalid";
    readonly reviewedDryRunStatus: "ready" | "blocked";
    readonly operatorCleanupDeletionDryRunReviewAcknowledgementReceiptId?: string;
    readonly nextAllowedAction: "retain_cleanup_deletion_dry_run_review_acknowledgement_for_audit" | "complete_cleanup_deletion_dry_run_receipt" | "provide_operator_cleanup_deletion_dry_run_acknowledgement_ref" | "provide_cleanup_deletion_dry_run_product_log_evidence_ref" | "provide_cleanup_deletion_dry_run_operator_review_acknowledgement_ref";
    readonly runGitNow: false;
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly createBranchNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.d.ts.map