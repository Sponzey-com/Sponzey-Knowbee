import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlanInput = {
    readonly cleanupBranchExecutionAdmission: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission;
    readonly deletionCandidateRefs?: readonly string[];
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1";
    readonly method: "browser.active_tab_info";
    readonly candidatePlanStatus: "ready" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready" | "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_admission_not_accepted" | "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_no_candidates" | "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_candidate_ref_invalid";
    readonly reviewedAdmissionStatus: "accepted" | "blocked";
    readonly candidateCount: number;
    readonly candidateRefs: readonly string[];
    readonly requiredDeletionReviewSteps: readonly string[];
    readonly requiredVerificationCommands: readonly string[];
    readonly nextAllowedAction: "review_cleanup_deletion_candidate_plan" | "complete_cleanup_branch_execution_admission" | "provide_cleanup_deletion_candidate_refs";
    readonly runGitNow: false;
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly createBranchNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlanInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.d.ts.map