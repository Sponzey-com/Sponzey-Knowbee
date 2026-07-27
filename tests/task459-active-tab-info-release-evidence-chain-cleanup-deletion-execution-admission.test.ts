import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.ts"
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

function acceptedReviewReceipt() {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
    cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
    operatorReviewReceiptRef:
      "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
  })
}

function blockedReviewReceipt() {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
    cleanupDeletionCandidatePlan: BLOCKED_CANDIDATE_PLAN,
    operatorReviewReceiptRef:
      "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
  })
}

describe("task459 active tab info release evidence chain cleanup deletion execution admission", () => {
  it("creates an audit-only accepted deletion execution admission from an accepted review receipt and safe admission ref", () => {
    const admission = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
      cleanupDeletionReviewReceipt: acceptedReviewReceipt(),
      operatorExecutionAdmissionRef:
        "cleanup-deletion-execution-admission:active-tab-info:operator:admission-001",
    })

    expect(admission).toMatchObject({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.v1",
      method: "browser.active_tab_info",
      admissionStatus: "accepted",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_accepted",
      reviewedReceiptStatus: "accepted",
      admissionDecision: "manual_cleanup_deletion_execution_admitted",
      nextAllowedAction: "prepare_cleanup_deletion_dry_run_after_execution_admission",
      runGitNow: false,
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
    expect(admission.executionAdmissionId).toMatch(
      /^cleanup-deletion-execution-admission:active-tab-info:sha256:[a-f0-9]{64}$/u,
    )
  })

  it("blocks execution admission until the deletion review receipt is accepted", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
      cleanupDeletionReviewReceipt: blockedReviewReceipt(),
      operatorExecutionAdmissionRef:
        "cleanup-deletion-execution-admission:active-tab-info:operator:admission-001",
    })).toMatchObject({
      admissionStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_review_receipt_not_accepted",
      reviewedReceiptStatus: "blocked",
      admissionDecision: "complete_cleanup_deletion_review_receipt",
      nextAllowedAction: "complete_cleanup_deletion_review_receipt",
    })
  })

  it("blocks a missing operator execution admission ref", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
      cleanupDeletionReviewReceipt: acceptedReviewReceipt(),
      operatorExecutionAdmissionRef: " ",
    })).toMatchObject({
      admissionStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_missing_admission_ref",
      reviewedReceiptStatus: "accepted",
      nextAllowedAction: "provide_cleanup_deletion_execution_admission_ref",
    })
  })

  it("blocks unsafe execution admission refs without exposing them", () => {
    const admission =
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
        cleanupDeletionReviewReceipt: acceptedReviewReceipt(),
        operatorExecutionAdmissionRef: "/Users/operator/project?token=secret",
      })

    expect(admission).toMatchObject({
      admissionStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_admission_ref_invalid",
      reviewedReceiptStatus: "accepted",
      nextAllowedAction: "provide_cleanup_deletion_execution_admission_ref",
    })
    expect(JSON.stringify(admission)).not.toMatch(
      /\/Users\/|token=secret|https?:\/\/|cleanup-deletion-review-receipt:|cleanup-deletion-candidate:|unused-ledger/iu,
    )
  })

  it("never exposes review receipt refs, candidate refs, local paths, URLs, tokens, or execution flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
        cleanupDeletionReviewReceipt: acceptedReviewReceipt(),
        operatorExecutionAdmissionRef:
          "cleanup-deletion-execution-admission:active-tab-info:operator:admission-001",
      }),
    )

    expect(serialized).not.toMatch(
      /cleanup-deletion-review-receipt:|cleanup-deletion-candidate:|unused-ledger|\/Users\/|\/private\/|https?:\/\/|token=|runGitNow":true|deleteCodeNow":true|modifyPackageNow":true|createBranchNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
