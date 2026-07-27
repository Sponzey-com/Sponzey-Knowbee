import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.ts"
import {
  type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.ts"

const READY_SUMMARY: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.v1",
  method: "browser.active_tab_info",
  summaryStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_ready",
  cleanupTaskCount: 2,
  nextOperatorAction: "review_separate_tidy_first_cleanup_task",
  requiresSeparateCommit: true,
  executeDeletionNow: false,
  modifyPackageNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

const BLOCKED_SUMMARY: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary = {
  ...READY_SUMMARY,
  summaryStatus: "blocked",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_task_plan_not_ready",
  cleanupTaskCount: 0,
  nextOperatorAction: "complete_cleanup_task_plan",
}

const FULL_COVERAGE = {
  coverageStatus: "covered" as const,
  coveredBoundaries: [
    "release_approval_evidence",
    "final_result",
    "product_log",
    "prepared_candidate",
    "operator_output",
  ] as const,
}

describe("task445 active tab info release evidence chain cleanup readiness index", () => {
  it("builds an audit-only ready index after summary and misuse guard coverage are ready", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex({
      cleanupTaskPlanSummary: READY_SUMMARY,
      misuseGuardCoverage: FULL_COVERAGE,
    })).toEqual({
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
    })
  })

  it("blocks the index when the cleanup task plan summary is not ready", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex({
      cleanupTaskPlanSummary: BLOCKED_SUMMARY,
      misuseGuardCoverage: FULL_COVERAGE,
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.v1",
      method: "browser.active_tab_info",
      indexStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_readiness_index_summary_not_ready",
      summaryReady: false,
      misuseGuardCoverageStatus: "covered",
      nextAllowedAction: "complete_cleanup_task_plan_summary",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks the index when misuse guard coverage is incomplete", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex({
      cleanupTaskPlanSummary: READY_SUMMARY,
      misuseGuardCoverage: {
        coverageStatus: "covered",
        coveredBoundaries: ["release_approval_evidence", "final_result"],
      },
    })).toMatchObject({
      indexStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_readiness_index_guard_coverage_incomplete",
      summaryReady: true,
      misuseGuardCoverageStatus: "incomplete",
      nextAllowedAction: "complete_cleanup_summary_misuse_guard",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
    })
  })

  it("does not expose raw refs, paths, URLs, tokens, or activation flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex({
        cleanupTaskPlanSummary: READY_SUMMARY,
        misuseGuardCoverage: FULL_COVERAGE,
      }),
    )

    expect(serialized).not.toMatch(
      /cleanup-approval:|cleanup-candidate:|tidy-first-cleanup-task:|\/Users\/|\/private\/|https?:\/\/|token=|raw response|raw reasoning|deleteCodeNow":true|modifyPackageNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
