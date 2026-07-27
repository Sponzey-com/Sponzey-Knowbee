import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan } from "./yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummaryInput = {
    readonly cleanupTaskPlan: YeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.v1";
    readonly method: "browser.active_tab_info";
    readonly summaryStatus: "ready" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_ready" | "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_task_plan_not_ready";
    readonly cleanupTaskCount: number;
    readonly nextOperatorAction: "review_separate_tidy_first_cleanup_task" | "complete_cleanup_task_plan";
    readonly requiresSeparateCommit: true;
    readonly executeDeletionNow: false;
    readonly modifyPackageNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummaryInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.d.ts.map