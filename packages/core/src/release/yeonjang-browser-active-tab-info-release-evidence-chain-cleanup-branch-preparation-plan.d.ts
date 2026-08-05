import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlanInput = {
    readonly cleanupPrReviewReceipt: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt;
    readonly sanitizedCleanupBranchRef?: string;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1";
    readonly method: "browser.active_tab_info";
    readonly planStatus: "ready" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready" | "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_receipt_not_accepted" | "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_branch_ref_invalid";
    readonly reviewedReceiptStatus: "accepted" | "blocked";
    readonly requiredBranchSteps: readonly string[];
    readonly requiredVerificationCommands: readonly string[];
    readonly rollbackNotes: readonly string[];
    readonly nextAllowedAction: "create_separate_cleanup_branch_manually" | "complete_cleanup_pr_review_receipt" | "provide_safe_cleanup_branch_ref";
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly createBranchNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlanInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.d.ts.map