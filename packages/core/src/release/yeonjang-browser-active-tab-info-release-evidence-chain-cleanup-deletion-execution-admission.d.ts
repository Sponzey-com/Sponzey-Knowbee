import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmissionInput = {
    readonly cleanupDeletionReviewReceipt: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt;
    readonly operatorExecutionAdmissionRef?: string;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.v1";
    readonly method: "browser.active_tab_info";
    readonly admissionStatus: "accepted" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_accepted" | "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_review_receipt_not_accepted" | "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_missing_admission_ref" | "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_admission_ref_invalid";
    readonly reviewedReceiptStatus: "accepted" | "blocked";
    readonly executionAdmissionId?: string;
    readonly admissionDecision: "manual_cleanup_deletion_execution_admitted" | "complete_cleanup_deletion_review_receipt";
    readonly nextAllowedAction: "prepare_cleanup_deletion_dry_run_after_execution_admission" | "complete_cleanup_deletion_review_receipt" | "provide_cleanup_deletion_execution_admission_ref";
    readonly runGitNow: false;
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly createBranchNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmissionInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.d.ts.map