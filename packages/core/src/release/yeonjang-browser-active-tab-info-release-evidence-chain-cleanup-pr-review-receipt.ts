import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceiptInput = {
  readonly cleanupPrChecklist: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist
  readonly operatorReviewRef?: string
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.v1"
  readonly method: "browser.active_tab_info"
  readonly receiptStatus: "accepted" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_accepted"
    | "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_checklist_not_ready"
    | "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_review_ref_invalid"
  readonly reviewDecision:
    | "cleanup_pr_preparation_accepted"
    | "complete_cleanup_pr_checklist"
    | "provide_safe_operator_review_ref"
  readonly reviewedChecklistStatus: "ready" | "blocked"
  readonly nextAllowedAction:
    | "prepare_cleanup_branch_after_review"
    | "complete_cleanup_pr_checklist"
    | "provide_safe_operator_review_ref"
  readonly deleteCodeNow: false
  readonly modifyPackageNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

const SAFE_OPERATOR_REVIEW_REF =
  /^cleanup-pr-review:active-tab-info:operator-accepted:[a-z0-9][a-z0-9:-]{0,96}$/u

function blocked(
  reasonCode: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt["reasonCode"],
  reviewDecision: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt["reviewDecision"],
  reviewedChecklistStatus: "ready" | "blocked",
  nextAllowedAction: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt["nextAllowedAction"],
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.v1",
    method: "browser.active_tab_info",
    receiptStatus: "blocked",
    reasonCode,
    reviewDecision,
    reviewedChecklistStatus,
    nextAllowedAction,
    deleteCodeNow: false,
    modifyPackageNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceiptInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt {
  if (input.cleanupPrChecklist.checklistStatus !== "ready") {
    return blocked(
      "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_checklist_not_ready",
      "complete_cleanup_pr_checklist",
      "blocked",
      "complete_cleanup_pr_checklist",
    )
  }

  const operatorReviewRef = input.operatorReviewRef?.trim() ?? ""
  if (!SAFE_OPERATOR_REVIEW_REF.test(operatorReviewRef)) {
    return blocked(
      "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_review_ref_invalid",
      "provide_safe_operator_review_ref",
      "ready",
      "provide_safe_operator_review_ref",
    )
  }

  return {
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
}
