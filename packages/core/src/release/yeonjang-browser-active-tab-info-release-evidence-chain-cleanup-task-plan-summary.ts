import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummaryInput = {
  readonly cleanupTaskPlan: YeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.v1"
  readonly method: "browser.active_tab_info"
  readonly summaryStatus: "ready" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_ready"
    | "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_task_plan_not_ready"
  readonly cleanupTaskCount: number
  readonly nextOperatorAction: "review_separate_tidy_first_cleanup_task" | "complete_cleanup_task_plan"
  readonly requiresSeparateCommit: true
  readonly executeDeletionNow: false
  readonly modifyPackageNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummaryInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary {
  if (input.cleanupTaskPlan.taskPlanStatus !== "ready") {
    return {
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.v1",
      method: "browser.active_tab_info",
      summaryStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_task_plan_not_ready",
      cleanupTaskCount: 0,
      nextOperatorAction: "complete_cleanup_task_plan",
      requiresSeparateCommit: true,
      executeDeletionNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    }
  }

  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.v1",
    method: "browser.active_tab_info",
    summaryStatus: "ready",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_ready",
    cleanupTaskCount: input.cleanupTaskPlan.cleanupTaskCount,
    nextOperatorAction: "review_separate_tidy_first_cleanup_task",
    requiresSeparateCommit: true,
    executeDeletionNow: false,
    modifyPackageNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}
