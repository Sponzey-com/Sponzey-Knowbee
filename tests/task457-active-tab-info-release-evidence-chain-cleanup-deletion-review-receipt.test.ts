import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.ts"

const READY_CANDIDATE_PLAN: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1",
  method: "browser.active_tab_info",
  candidatePlanStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready",
  reviewedAdmissionStatus: "accepted",
  candidateCount: 1,
  candidateRefs: ["cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001"],
  requiredDeletionReviewSteps: [
    "Review every sanitized cleanup deletion candidate before opening a separate Tidy First cleanup task.",
  ],
  requiredVerificationCommands: ["pnpm --filter @knowbee/core build"],
  nextAllowedAction: "review_cleanup_deletion_candidate_plan",
  runGitNow: false,
  deleteCodeNow: false,
  modifyPackageNow: false,
  createBranchNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

const BLOCKED_CANDIDATE_PLAN: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan = {
  ...READY_CANDIDATE_PLAN,
  candidatePlanStatus: "blocked",
  reasonCode:
    "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_no_candidates",
  candidateCount: 0,
  candidateRefs: [],
  requiredDeletionReviewSteps: [],
  requiredVerificationCommands: [],
  nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
}

describe("task457 active tab info release evidence chain cleanup deletion review receipt", () => {
  it("creates an audit-only accepted deletion review receipt from a ready candidate plan and safe receipt ref", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
      cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
      operatorReviewReceiptRef:
        "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
    })).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.v1",
      method: "browser.active_tab_info",
      receiptStatus: "accepted",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_accepted",
      reviewedCandidatePlanStatus: "ready",
      reviewDecision: "manual_cleanup_deletion_review_accepted",
      nextAllowedAction: "prepare_cleanup_deletion_execution_admission_after_review_receipt",
      runGitNow: false,
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks deletion review receipt creation until the candidate plan is ready", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
      cleanupDeletionCandidatePlan: BLOCKED_CANDIDATE_PLAN,
      operatorReviewReceiptRef:
        "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
    })).toMatchObject({
      receiptStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_candidate_plan_not_ready",
      reviewedCandidatePlanStatus: "blocked",
      reviewDecision: "complete_cleanup_deletion_candidate_plan",
      nextAllowedAction: "complete_cleanup_deletion_candidate_plan",
    })
  })

  it("blocks a missing operator review receipt ref", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
      cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
      operatorReviewReceiptRef: " ",
    })).toMatchObject({
      receiptStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_missing_receipt_ref",
      reviewedCandidatePlanStatus: "ready",
      nextAllowedAction: "provide_cleanup_deletion_review_receipt_ref",
    })
  })

  it("blocks unsafe receipt refs without exposing them", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
        cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
        operatorReviewReceiptRef: "/Users/operator/project?token=secret",
      })

    expect(receipt).toMatchObject({
      receiptStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_receipt_ref_invalid",
      reviewedCandidatePlanStatus: "ready",
      nextAllowedAction: "provide_cleanup_deletion_review_receipt_ref",
    })
    expect(JSON.stringify(receipt)).not.toMatch(
      /\/Users\/|token=secret|https?:\/\/|cleanup-deletion-candidate:|unused-ledger/iu,
    )
  })

  it("never exposes candidate refs, local paths, URLs, tokens, or execution flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
        cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
        operatorReviewReceiptRef:
          "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
      }),
    )

    expect(serialized).not.toMatch(
      /cleanup-deletion-candidate:|unused-ledger|\/Users\/|\/private\/|https?:\/\/|token=|runGitNow":true|deleteCodeNow":true|modifyPackageNow":true|createBranchNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
