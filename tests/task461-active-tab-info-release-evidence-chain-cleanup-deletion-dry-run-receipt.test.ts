import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.ts"
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

function acceptedExecutionAdmission() {
  const cleanupDeletionReviewReceipt =
    buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
      cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
      operatorReviewReceiptRef:
        "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
    })

  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
    cleanupDeletionReviewReceipt,
    operatorExecutionAdmissionRef:
      "cleanup-deletion-execution-admission:active-tab-info:operator:admission-001",
  })
}

function blockedExecutionAdmission() {
  const cleanupDeletionReviewReceipt =
    buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
      cleanupDeletionCandidatePlan: BLOCKED_CANDIDATE_PLAN,
      operatorReviewReceiptRef:
        "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
    })

  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
    cleanupDeletionReviewReceipt,
    operatorExecutionAdmissionRef:
      "cleanup-deletion-execution-admission:active-tab-info:operator:admission-001",
  })
}

const READY_INPUT = {
  operatorDryRunReceiptRef:
    "cleanup-deletion-dry-run-receipt:active-tab-info:sanitized:dry-run-001",
  sanitizedDeletionCandidateRefs: [
    "cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001",
  ],
  requiredVerificationCommands: ["pnpm --filter @knowbee/core build"],
  rollbackNotes: ["Restore from the retained cleanup review receipt before retrying."],
} as const

describe("task461 active tab info release evidence chain cleanup deletion dry-run receipt", () => {
  it("creates an audit-only ready deletion dry-run receipt from an accepted execution admission and safe dry-run ref", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
      cleanupDeletionExecutionAdmission: acceptedExecutionAdmission(),
      ...READY_INPUT,
    })

    expect(receipt).toMatchObject({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.v1",
      method: "browser.active_tab_info",
      dryRunStatus: "ready",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_ready",
      reviewedAdmissionStatus: "accepted",
      candidateCount: 1,
      requiredVerificationCommandCount: 1,
      rollbackNoteCount: 1,
      nextAllowedAction: "review_cleanup_deletion_dry_run_receipt",
      runGitNow: false,
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
    expect(receipt.dryRunReceiptId).toMatch(
      /^cleanup-deletion-dry-run-receipt:active-tab-info:sha256:[a-f0-9]{64}$/u,
    )
  })

  it("blocks dry-run receipt creation until the execution admission is accepted", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
      cleanupDeletionExecutionAdmission: blockedExecutionAdmission(),
      ...READY_INPUT,
    })).toMatchObject({
      dryRunStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_execution_admission_not_accepted",
      reviewedAdmissionStatus: "blocked",
      nextAllowedAction: "complete_cleanup_deletion_execution_admission",
    })
  })

  it("blocks a missing operator dry-run receipt ref", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
      cleanupDeletionExecutionAdmission: acceptedExecutionAdmission(),
      ...READY_INPUT,
      operatorDryRunReceiptRef: " ",
    })).toMatchObject({
      dryRunStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_missing_receipt_ref",
      reviewedAdmissionStatus: "accepted",
      nextAllowedAction: "provide_cleanup_deletion_dry_run_receipt_ref",
    })
  })

  it("blocks unsafe dry-run receipt refs without exposing them", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
        cleanupDeletionExecutionAdmission: acceptedExecutionAdmission(),
        ...READY_INPUT,
        operatorDryRunReceiptRef: "/Users/operator/project?token=secret",
      })

    expect(receipt).toMatchObject({
      dryRunStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_receipt_ref_invalid",
      reviewedAdmissionStatus: "accepted",
      nextAllowedAction: "provide_cleanup_deletion_dry_run_receipt_ref",
    })
    expect(JSON.stringify(receipt)).not.toMatch(
      /\/Users\/|token=secret|https?:\/\/|cleanup-deletion-execution-admission:|cleanup-deletion-review-receipt:|cleanup-deletion-candidate:|unused-ledger/iu,
    )
  })

  it("blocks zero candidate dry-runs and unsafe candidate refs", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
      cleanupDeletionExecutionAdmission: acceptedExecutionAdmission(),
      ...READY_INPUT,
      sanitizedDeletionCandidateRefs: [],
    })).toMatchObject({
      dryRunStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_no_candidates",
      reviewedAdmissionStatus: "accepted",
      nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
    })

    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
      cleanupDeletionExecutionAdmission: acceptedExecutionAdmission(),
      ...READY_INPUT,
      sanitizedDeletionCandidateRefs: ["/private/tmp/secret?token=raw"],
    })).toMatchObject({
      dryRunStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_candidate_ref_invalid",
      reviewedAdmissionStatus: "accepted",
      nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
    })
  })

  it("never exposes raw refs, candidate refs, command text, rollback notes, local paths, URLs, tokens, or execution flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
        cleanupDeletionExecutionAdmission: acceptedExecutionAdmission(),
        ...READY_INPUT,
      }),
    )

    expect(serialized).not.toMatch(
      /cleanup-deletion-execution-admission:|cleanup-deletion-review-receipt:|cleanup-deletion-candidate:|unused-ledger|pnpm --filter|Restore from|\/Users\/|\/private\/|https?:\/\/|token=|runGitNow":true|deleteCodeNow":true|modifyPackageNow":true|createBranchNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
