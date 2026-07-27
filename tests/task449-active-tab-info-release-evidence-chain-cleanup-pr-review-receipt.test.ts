import { describe, expect, it } from "vitest"

import {
  type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.ts"

const SAFE_REVIEW_REF = "cleanup-pr-review:active-tab-info:operator-accepted:manual-review-001"

const READY_CHECKLIST: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.v1",
  method: "browser.active_tab_info",
  checklistStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_checklist_ready",
  requiredReviewSteps: [
    "Confirm cleanup readiness index is ready and audit-only.",
    "Open a separate Tidy First cleanup PR without release activation changes.",
    "Review removed contracts against active release gate command coverage.",
  ],
  requiredTestCommands: [
    "pnpm exec vitest run ./tests/task446-active-tab-info-release-evidence-chain-cleanup-readiness-index-misuse-guard.test.ts ./tests/task445-active-tab-info-release-evidence-chain-cleanup-readiness-index.test.ts",
    "pnpm --filter @knowbee/core build",
  ],
  rollbackNotes: [
    "Revert only the separate cleanup PR if release gate coverage changes unexpectedly.",
    "Do not enable Skill mapping, production binding, or default live smoke during cleanup rollback.",
  ],
  nextAllowedAction: "open_cleanup_pr_after_manual_review",
  deleteCodeNow: false,
  modifyPackageNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

const BLOCKED_CHECKLIST: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist = {
  ...READY_CHECKLIST,
  checklistStatus: "blocked",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_checklist_readiness_not_ready",
  requiredReviewSteps: [],
  requiredTestCommands: [],
  rollbackNotes: [],
  nextAllowedAction: "complete_cleanup_readiness_index",
}

describe("task449 active tab info release evidence chain cleanup PR review receipt", () => {
  it("accepts a ready checklist with a safe operator review ref", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt({
      cleanupPrChecklist: READY_CHECKLIST,
      operatorReviewRef: SAFE_REVIEW_REF,
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.v1",
      method: "browser.active_tab_info",
      receiptStatus: "accepted",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_accepted",
      reviewDecision: "cleanup_pr_preparation_accepted",
      reviewedChecklistStatus: "ready",
      nextAllowedAction: "prepare_cleanup_branch_after_review",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks receipt creation until the checklist is ready", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt({
      cleanupPrChecklist: BLOCKED_CHECKLIST,
      operatorReviewRef: SAFE_REVIEW_REF,
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.v1",
      method: "browser.active_tab_info",
      receiptStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_checklist_not_ready",
      reviewDecision: "complete_cleanup_pr_checklist",
      reviewedChecklistStatus: "blocked",
      nextAllowedAction: "complete_cleanup_pr_checklist",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks unsafe operator review refs", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt({
      cleanupPrChecklist: READY_CHECKLIST,
      operatorReviewRef: "/Users/operator/raw-identity?token=secret",
    })).toMatchObject({
      receiptStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_review_ref_invalid",
      reviewDecision: "provide_safe_operator_review_ref",
      reviewedChecklistStatus: "ready",
      nextAllowedAction: "provide_safe_operator_review_ref",
    })
  })

  it("does not expose raw identity, tokens, paths, URLs, cleanup refs, or activation flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt({
        cleanupPrChecklist: READY_CHECKLIST,
        operatorReviewRef: SAFE_REVIEW_REF,
      }),
    )

    expect(serialized).not.toContain(SAFE_REVIEW_REF)
    expect(serialized).not.toMatch(
      /operator-identity|reviewerIdentityHash|approval token|token=|\/Users\/|\/private\/|https?:\/\/|cleanup-approval:|cleanup-candidate:|tidy-first-cleanup-task:|deleteCodeNow":true|modifyPackageNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
