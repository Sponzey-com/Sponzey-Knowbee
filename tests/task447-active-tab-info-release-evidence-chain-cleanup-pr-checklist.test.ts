import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.ts"
import {
  type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.ts"

const READY_INDEX: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex = {
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

const BLOCKED_INDEX: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex = {
  ...READY_INDEX,
  indexStatus: "blocked",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_readiness_index_guard_coverage_incomplete",
  misuseGuardCoverageStatus: "incomplete",
  nextAllowedAction: "complete_cleanup_summary_misuse_guard",
}

describe("task447 active tab info release evidence chain cleanup PR checklist", () => {
  it("builds a ready checklist that prepares a separate cleanup PR only", () => {
    const checklist = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist({
      cleanupReadinessIndex: READY_INDEX,
    })

    expect(checklist).toMatchObject({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.v1",
      method: "browser.active_tab_info",
      checklistStatus: "ready",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_checklist_ready",
      nextAllowedAction: "open_cleanup_pr_after_manual_review",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
    expect(checklist.requiredReviewSteps.length).toBeGreaterThanOrEqual(3)
    expect(checklist.requiredTestCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining("task446-active-tab-info-release-evidence-chain-cleanup-readiness-index-misuse-guard.test.ts"),
        "pnpm --filter @knowbee/core build",
      ]),
    )
    expect(checklist.rollbackNotes.length).toBeGreaterThanOrEqual(2)
  })

  it("blocks checklist creation until cleanup readiness index is ready", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist({
      cleanupReadinessIndex: BLOCKED_INDEX,
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.v1",
      method: "browser.active_tab_info",
      checklistStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_checklist_readiness_not_ready",
      requiredReviewSteps: [],
      requiredTestCommands: [],
      rollbackNotes: [],
      nextAllowedAction: "complete_cleanup_readiness_index",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("keeps commands as validation-only and does not expose raw cleanup references", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist({
        cleanupReadinessIndex: READY_INDEX,
      }),
    )

    expect(serialized).toContain("vitest run")
    expect(serialized).not.toMatch(
      /rm -rf|git rm|delete file|cleanup-approval:|cleanup-candidate:|tidy-first-cleanup-task:|\/Users\/|\/private\/|https?:\/\/|token=|raw response|raw reasoning|deleteCodeNow":true|modifyPackageNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
