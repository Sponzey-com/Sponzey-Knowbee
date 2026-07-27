import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlanInput = {
    readonly cleanupApprovalGate: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate;
    readonly cleanupTaskRefs: readonly string[];
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.v1";
    readonly method: "browser.active_tab_info";
    readonly taskPlanStatus: "ready" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_ready" | "active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_approval_not_ready" | "active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_ref_invalid";
    readonly cleanupTaskCount: number;
    readonly cleanupTaskRefs: readonly string[];
    readonly nextAllowedAction: "run_separate_tidy_first_cleanup_task" | "complete_cleanup_approval";
    readonly executeDeletionNow: false;
    readonly modifyPackageNow: false;
    readonly requiresSeparateCommit: true;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlanInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.d.ts.map