import { describe, expect, it } from "vitest"

import {
  type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.ts"

const SAFE_BRANCH_REF =
  "cleanup-branch-preparation:active-tab-info:sanitized:manual-branch-001"

const ACCEPTED_RECEIPT: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt = {
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
}

const BLOCKED_RECEIPT: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt = {
  ...ACCEPTED_RECEIPT,
  receiptStatus: "blocked",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_checklist_not_ready",
  reviewDecision: "complete_cleanup_pr_checklist",
  reviewedChecklistStatus: "blocked",
  nextAllowedAction: "complete_cleanup_pr_checklist",
}

describe("task451 active tab info release evidence chain cleanup branch preparation plan", () => {
  it("creates an audit-only branch preparation plan from an accepted review receipt", () => {
    const plan = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan({
      cleanupPrReviewReceipt: ACCEPTED_RECEIPT,
      sanitizedCleanupBranchRef: SAFE_BRANCH_REF,
    })

    expect(plan).toMatchObject({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1",
      method: "browser.active_tab_info",
      planStatus: "ready",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready",
      reviewedReceiptStatus: "accepted",
      nextAllowedAction: "create_separate_cleanup_branch_manually",
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
    expect(plan.requiredBranchSteps).toEqual([
      "Create a separate Tidy First cleanup branch after confirming the accepted cleanup PR review receipt.",
      "Remove only reviewed cleanup candidates in the separate cleanup branch.",
      "Keep release activation, Skill mapping, production binding, and default live smoke changes out of the cleanup branch.",
    ])
    expect(plan.requiredVerificationCommands).toEqual([
      "pnpm exec vitest run ./tests/task450-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt-misuse-guard.test.ts ./tests/task449-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.test.ts",
      "pnpm --filter @knowbee/core build",
    ])
    expect(plan.rollbackNotes).toEqual([
      "Revert only the separate cleanup branch if release gate evidence changes unexpectedly.",
      "Do not use cleanup rollback to enable release activation or runtime mutation.",
    ])
  })

  it("blocks branch preparation until the review receipt is accepted", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan({
      cleanupPrReviewReceipt: BLOCKED_RECEIPT,
      sanitizedCleanupBranchRef: SAFE_BRANCH_REF,
    })).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1",
      method: "browser.active_tab_info",
      planStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_receipt_not_accepted",
      reviewedReceiptStatus: "blocked",
      requiredBranchSteps: [],
      requiredVerificationCommands: [],
      rollbackNotes: [],
      nextAllowedAction: "complete_cleanup_pr_review_receipt",
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks unsafe cleanup branch refs without exposing them", () => {
    const plan = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan({
      cleanupPrReviewReceipt: ACCEPTED_RECEIPT,
      sanitizedCleanupBranchRef: "/Users/operator/work?token=secret",
    })

    expect(plan).toMatchObject({
      planStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_branch_ref_invalid",
      reviewedReceiptStatus: "accepted",
      nextAllowedAction: "provide_safe_cleanup_branch_ref",
    })
    expect(JSON.stringify(plan)).not.toMatch(/\/Users\/|token=secret|https?:\/\/|cleanup-pr-review:|tidy-first-cleanup-task:|cleanup-candidate:/iu)
  })

  it("never exposes raw refs, local paths, URLs, tokens, or execution flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan({
        cleanupPrReviewReceipt: ACCEPTED_RECEIPT,
        sanitizedCleanupBranchRef: SAFE_BRANCH_REF,
      }),
    )

    expect(serialized).not.toContain(SAFE_BRANCH_REF)
    expect(serialized).not.toMatch(
      /\/Users\/|\/private\/|https?:\/\/|token=|cleanup-pr-review:|tidy-first-cleanup-task:|cleanup-candidate:|deleteCodeNow":true|modifyPackageNow":true|createBranchNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
