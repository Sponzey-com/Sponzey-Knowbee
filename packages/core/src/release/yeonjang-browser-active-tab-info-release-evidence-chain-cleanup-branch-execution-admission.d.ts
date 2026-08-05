import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmissionInput = {
    readonly cleanupBranchPreparationPlan: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan;
    readonly operatorExecutionAdmissionRef?: string;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1";
    readonly method: "browser.active_tab_info";
    readonly admissionStatus: "accepted" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted" | "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_plan_not_ready" | "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_ref_invalid";
    readonly reviewedPlanStatus: "ready" | "blocked";
    readonly admissionDecision: "manual_cleanup_branch_execution_admitted" | "complete_cleanup_branch_preparation_plan" | "provide_safe_cleanup_branch_execution_admission_ref";
    readonly requiredExecutionBoundaries: readonly string[];
    readonly nextAllowedAction: "prepare_cleanup_deletion_candidate_after_branch_admission" | "complete_cleanup_branch_preparation_plan" | "provide_safe_cleanup_branch_execution_admission_ref";
    readonly runGitNow: false;
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly createBranchNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmissionInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.d.ts.map