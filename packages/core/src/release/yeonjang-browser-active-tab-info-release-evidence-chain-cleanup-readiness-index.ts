import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessBoundary =
  | "release_approval_evidence"
  | "final_result"
  | "product_log"
  | "prepared_candidate"
  | "operator_output"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndexInput = {
  readonly cleanupTaskPlanSummary: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary
  readonly misuseGuardCoverage: {
    readonly coverageStatus: "covered" | "incomplete"
    readonly coveredBoundaries: readonly YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessBoundary[]
  }
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.v1"
  readonly method: "browser.active_tab_info"
  readonly indexStatus: "ready" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_readiness_index_ready"
    | "active_tab_info_release_evidence_chain_cleanup_readiness_index_summary_not_ready"
    | "active_tab_info_release_evidence_chain_cleanup_readiness_index_guard_coverage_incomplete"
  readonly summaryReady: boolean
  readonly misuseGuardCoverageStatus: "covered" | "incomplete"
  readonly nextAllowedAction:
    | "prepare_separate_tidy_first_cleanup_pr"
    | "complete_cleanup_task_plan_summary"
    | "complete_cleanup_summary_misuse_guard"
  readonly deleteCodeNow: false
  readonly modifyPackageNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

const REQUIRED_BOUNDARIES: readonly YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessBoundary[] = [
  "release_approval_evidence",
  "final_result",
  "product_log",
  "prepared_candidate",
  "operator_output",
]

function hasRequiredCoverage(
  coveredBoundaries: readonly YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessBoundary[],
): boolean {
  const covered = new Set(coveredBoundaries)
  return REQUIRED_BOUNDARIES.every((boundary) => covered.has(boundary))
}

function blocked(
  reasonCode: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex["reasonCode"],
  summaryReady: boolean,
  misuseGuardCoverageStatus: "covered" | "incomplete",
  nextAllowedAction: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex["nextAllowedAction"],
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.v1",
    method: "browser.active_tab_info",
    indexStatus: "blocked",
    reasonCode,
    summaryReady,
    misuseGuardCoverageStatus,
    nextAllowedAction,
    deleteCodeNow: false,
    modifyPackageNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndexInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex {
  const summaryReady = input.cleanupTaskPlanSummary.summaryStatus === "ready"
  if (!summaryReady) {
    return blocked(
      "active_tab_info_release_evidence_chain_cleanup_readiness_index_summary_not_ready",
      false,
      input.misuseGuardCoverage.coverageStatus,
      "complete_cleanup_task_plan_summary",
    )
  }

  if (
    input.misuseGuardCoverage.coverageStatus !== "covered" ||
    !hasRequiredCoverage(input.misuseGuardCoverage.coveredBoundaries)
  ) {
    return blocked(
      "active_tab_info_release_evidence_chain_cleanup_readiness_index_guard_coverage_incomplete",
      true,
      "incomplete",
      "complete_cleanup_summary_misuse_guard",
    )
  }

  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.v1",
    method: "browser.active_tab_info",
    indexStatus: "ready",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_readiness_index_ready",
    summaryReady: true,
    misuseGuardCoverageStatus: "covered",
    nextAllowedAction: "prepare_separate_tidy_first_cleanup_pr",
    deleteCodeNow: false,
    modifyPackageNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}
