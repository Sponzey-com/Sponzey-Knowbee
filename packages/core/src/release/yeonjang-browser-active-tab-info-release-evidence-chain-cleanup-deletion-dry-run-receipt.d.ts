import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceiptInput = {
    readonly cleanupDeletionExecutionAdmission: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission;
    readonly operatorDryRunReceiptRef?: string;
    readonly sanitizedDeletionCandidateRefs: readonly string[];
    readonly requiredVerificationCommands: readonly string[];
    readonly rollbackNotes: readonly string[];
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.v1";
    readonly method: "browser.active_tab_info";
    readonly dryRunStatus: "ready" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_ready" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_execution_admission_not_accepted" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_missing_receipt_ref" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_receipt_ref_invalid" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_no_candidates" | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_candidate_ref_invalid";
    readonly reviewedAdmissionStatus: "accepted" | "blocked";
    readonly dryRunReceiptId?: string;
    readonly candidateCount: number;
    readonly requiredVerificationCommandCount: number;
    readonly rollbackNoteCount: number;
    readonly nextAllowedAction: "review_cleanup_deletion_dry_run_receipt" | "complete_cleanup_deletion_execution_admission" | "provide_cleanup_deletion_dry_run_receipt_ref" | "provide_cleanup_deletion_candidate_refs";
    readonly runGitNow: false;
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly createBranchNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceiptInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.d.ts.map