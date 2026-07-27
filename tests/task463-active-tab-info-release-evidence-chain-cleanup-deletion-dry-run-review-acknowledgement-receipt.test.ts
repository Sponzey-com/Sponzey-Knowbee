import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.ts"

const READY_CANDIDATE_PLAN: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1",
  method: "browser.active_tab_info",
  candidatePlanStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready",
  reviewedAdmissionStatus: "accepted",
  candidateCount: 1,
  candidateRefs: ["cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001"],
  requiredDeletionReviewSteps: ["Review the sanitized candidate before a separate Tidy First task."],
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

function readyDryRunReceipt() {
  const reviewReceipt = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
    cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
    operatorReviewReceiptRef: "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
  })
  const executionAdmission = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
    cleanupDeletionReviewReceipt: reviewReceipt,
    operatorExecutionAdmissionRef:
      "cleanup-deletion-execution-admission:active-tab-info:operator:admission-001",
  })
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
    cleanupDeletionExecutionAdmission: executionAdmission,
    operatorDryRunReceiptRef: "cleanup-deletion-dry-run-receipt:active-tab-info:sanitized:dry-run-001",
    sanitizedDeletionCandidateRefs: ["cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001"],
    requiredVerificationCommands: ["pnpm --filter @knowbee/core build"],
    rollbackNotes: ["Restore from the retained review receipt before retrying."],
  })
}

const READY_INPUT = {
  sanitizedOperatorAcknowledgementRef:
    "cleanup-deletion-dry-run-acknowledgement:active-tab-info:sanitized:operator-ack-001",
  productLogEvidenceRef: "product-log:active-tab-info:evidence:dry-run-review-001",
  operatorReviewAcknowledgementRef:
    "cleanup-deletion-dry-run-review-acknowledgement:active-tab-info:sanitized:review-ack-001",
} as const

describe("task463 active tab info cleanup deletion dry-run review acknowledgement receipt", () => {
  it("accepts only a ready dry-run receipt with three safe audit references", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt({
      cleanupDeletionDryRunReceipt: readyDryRunReceipt(),
      ...READY_INPUT,
    })

    expect(receipt).toMatchObject({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      receiptStatus: "accepted",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_accepted",
      reviewedDryRunStatus: "ready",
      nextAllowedAction: "retain_cleanup_deletion_dry_run_review_acknowledgement_for_audit",
      runGitNow: false,
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
    expect(receipt.operatorCleanupDeletionDryRunReviewAcknowledgementReceiptId).toMatch(
      /^operator-cleanup-deletion-dry-run-review-acknowledgement-receipt:active-tab-info:sha256:[a-f0-9]{64}$/u,
    )
  })

  it("blocks acknowledgement until the dry-run receipt is ready for review", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt({
      cleanupDeletionDryRunReceipt: { ...readyDryRunReceipt(), dryRunStatus: "blocked" },
      ...READY_INPUT,
    })).toMatchObject({
      receiptStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_dry_run_not_ready",
      reviewedDryRunStatus: "blocked",
      nextAllowedAction: "complete_cleanup_deletion_dry_run_receipt",
    })
  })

  it("blocks missing or unsafe acknowledgement references without exposing them", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt({
      cleanupDeletionDryRunReceipt: readyDryRunReceipt(),
      ...READY_INPUT,
      sanitizedOperatorAcknowledgementRef: " ",
    })).toMatchObject({
      receiptStatus: "blocked",
      nextAllowedAction: "provide_operator_cleanup_deletion_dry_run_acknowledgement_ref",
    })

    const receipt = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt({
      cleanupDeletionDryRunReceipt: readyDryRunReceipt(),
      ...READY_INPUT,
      productLogEvidenceRef: "/private/tmp/dry-run?token=secret",
    })
    expect(receipt).toMatchObject({
      receiptStatus: "blocked",
      nextAllowedAction: "provide_cleanup_deletion_dry_run_product_log_evidence_ref",
    })
    expect(JSON.stringify(receipt)).not.toMatch(/\/private\/|token=secret|https?:\/\//iu)
  })

  it("never exposes the raw dry-run receipt id, audit refs, candidate data, commands, rollback notes, paths, URLs, tokens, or enabled flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt({
        cleanupDeletionDryRunReceipt: readyDryRunReceipt(),
        ...READY_INPUT,
      }),
    )

    expect(serialized).not.toMatch(
      /cleanup-deletion-dry-run-receipt:|cleanup-deletion-candidate:|unused-ledger|cleanup-deletion-dry-run-acknowledgement:|product-log:|cleanup-deletion-dry-run-review-acknowledgement:|pnpm --filter|Restore from|\/Users\/|\/private\/|https?:\/\/|token=|runGitNow":true|deleteCodeNow":true|modifyPackageNow":true|createBranchNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
