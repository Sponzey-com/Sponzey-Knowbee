import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlanInput = {
  readonly cleanupPrReviewReceipt: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt
  readonly sanitizedCleanupBranchRef?: string
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1"
  readonly method: "browser.active_tab_info"
  readonly planStatus: "ready" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready"
    | "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_receipt_not_accepted"
    | "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_branch_ref_invalid"
  readonly reviewedReceiptStatus: "accepted" | "blocked"
  readonly requiredBranchSteps: readonly string[]
  readonly requiredVerificationCommands: readonly string[]
  readonly rollbackNotes: readonly string[]
  readonly nextAllowedAction:
    | "create_separate_cleanup_branch_manually"
    | "complete_cleanup_pr_review_receipt"
    | "provide_safe_cleanup_branch_ref"
  readonly deleteCodeNow: false
  readonly modifyPackageNow: false
  readonly createBranchNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

const SAFE_CLEANUP_BRANCH_REF =
  /^cleanup-branch-preparation:active-tab-info:sanitized:[a-z0-9][a-z0-9:-]{0,96}$/u

function blocked(input: {
  reasonCode: Exclude<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan["reasonCode"],
    "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready"
  >
  reviewedReceiptStatus: "accepted" | "blocked"
  nextAllowedAction: Extract<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan["nextAllowedAction"],
    "complete_cleanup_pr_review_receipt" | "provide_safe_cleanup_branch_ref"
  >
}): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan {
  return {
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1",
    method: "browser.active_tab_info",
    planStatus: "blocked",
    reasonCode: input.reasonCode,
    reviewedReceiptStatus: input.reviewedReceiptStatus,
    requiredBranchSteps: [],
    requiredVerificationCommands: [],
    rollbackNotes: [],
    nextAllowedAction: input.nextAllowedAction,
    deleteCodeNow: false,
    modifyPackageNow: false,
    createBranchNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlanInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan {
  if (
    input.cleanupPrReviewReceipt.receiptStatus !== "accepted" ||
    input.cleanupPrReviewReceipt.nextAllowedAction !== "prepare_cleanup_branch_after_review"
  ) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_receipt_not_accepted",
      reviewedReceiptStatus: input.cleanupPrReviewReceipt.receiptStatus,
      nextAllowedAction: "complete_cleanup_pr_review_receipt",
    })
  }

  const sanitizedCleanupBranchRef = input.sanitizedCleanupBranchRef?.trim() ?? ""
  if (!SAFE_CLEANUP_BRANCH_REF.test(sanitizedCleanupBranchRef)) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_branch_ref_invalid",
      reviewedReceiptStatus: "accepted",
      nextAllowedAction: "provide_safe_cleanup_branch_ref",
    })
  }

  return {
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1",
    method: "browser.active_tab_info",
    planStatus: "ready",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready",
    reviewedReceiptStatus: "accepted",
    requiredBranchSteps: [
      "Create a separate Tidy First cleanup branch after confirming the accepted cleanup PR review receipt.",
      "Remove only reviewed cleanup candidates in the separate cleanup branch.",
      "Keep release activation, Skill mapping, production binding, and default live smoke changes out of the cleanup branch.",
    ],
    requiredVerificationCommands: [
      "pnpm exec vitest run ./tests/task450-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt-misuse-guard.test.ts ./tests/task449-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.test.ts",
      "pnpm --filter @knowbee/core build",
    ],
    rollbackNotes: [
      "Revert only the separate cleanup branch if release gate evidence changes unexpectedly.",
      "Do not use cleanup rollback to enable release activation or runtime mutation.",
    ],
    nextAllowedAction: "create_separate_cleanup_branch_manually",
    deleteCodeNow: false,
    modifyPackageNow: false,
    createBranchNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}
