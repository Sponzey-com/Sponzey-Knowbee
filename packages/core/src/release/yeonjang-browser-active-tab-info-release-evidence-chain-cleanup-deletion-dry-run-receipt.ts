import { createHash } from "node:crypto"

import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceiptInput = {
  readonly cleanupDeletionExecutionAdmission: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission
  readonly operatorDryRunReceiptRef?: string
  readonly sanitizedDeletionCandidateRefs: readonly string[]
  readonly requiredVerificationCommands: readonly string[]
  readonly rollbackNotes: readonly string[]
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.v1"
  readonly method: "browser.active_tab_info"
  readonly dryRunStatus: "ready" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_ready"
    | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_execution_admission_not_accepted"
    | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_missing_receipt_ref"
    | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_receipt_ref_invalid"
    | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_no_candidates"
    | "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_candidate_ref_invalid"
  readonly reviewedAdmissionStatus: "accepted" | "blocked"
  readonly dryRunReceiptId?: string
  readonly candidateCount: number
  readonly requiredVerificationCommandCount: number
  readonly rollbackNoteCount: number
  readonly nextAllowedAction:
    | "review_cleanup_deletion_dry_run_receipt"
    | "complete_cleanup_deletion_execution_admission"
    | "provide_cleanup_deletion_dry_run_receipt_ref"
    | "provide_cleanup_deletion_candidate_refs"
  readonly runGitNow: false
  readonly deleteCodeNow: false
  readonly modifyPackageNow: false
  readonly createBranchNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

const SAFE_OPERATOR_DRY_RUN_RECEIPT_REF =
  /^cleanup-deletion-dry-run-receipt:active-tab-info:sanitized:[a-z0-9][a-z0-9:-]{0,96}$/u
const SAFE_SANITIZED_DELETION_CANDIDATE_REF =
  /^cleanup-deletion-candidate:active-tab-info:sanitized:[a-z0-9][a-z0-9:-]{0,96}$/u

function buildDryRunReceiptId(receiptRef: string): string {
  return `cleanup-deletion-dry-run-receipt:active-tab-info:sha256:${
    createHash("sha256").update(receiptRef).digest("hex")
  }`
}

function blocked(input: {
  reasonCode: Exclude<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt["reasonCode"],
    "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_ready"
  >
  reviewedAdmissionStatus: "accepted" | "blocked"
  candidateCount?: number
  requiredVerificationCommandCount?: number
  rollbackNoteCount?: number
  nextAllowedAction: Extract<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt["nextAllowedAction"],
    | "complete_cleanup_deletion_execution_admission"
    | "provide_cleanup_deletion_dry_run_receipt_ref"
    | "provide_cleanup_deletion_candidate_refs"
  >
}): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt {
  return {
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.v1",
    method: "browser.active_tab_info",
    dryRunStatus: "blocked",
    reasonCode: input.reasonCode,
    reviewedAdmissionStatus: input.reviewedAdmissionStatus,
    candidateCount: input.candidateCount ?? 0,
    requiredVerificationCommandCount: input.requiredVerificationCommandCount ?? 0,
    rollbackNoteCount: input.rollbackNoteCount ?? 0,
    nextAllowedAction: input.nextAllowedAction,
    runGitNow: false,
    deleteCodeNow: false,
    modifyPackageNow: false,
    createBranchNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceiptInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt {
  if (
    input.cleanupDeletionExecutionAdmission.admissionStatus !== "accepted" ||
    input.cleanupDeletionExecutionAdmission.nextAllowedAction !==
      "prepare_cleanup_deletion_dry_run_after_execution_admission"
  ) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_execution_admission_not_accepted",
      reviewedAdmissionStatus: input.cleanupDeletionExecutionAdmission.admissionStatus,
      nextAllowedAction: "complete_cleanup_deletion_execution_admission",
    })
  }

  const receiptRef = input.operatorDryRunReceiptRef?.trim() ?? ""
  if (receiptRef.length === 0) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_missing_receipt_ref",
      reviewedAdmissionStatus: "accepted",
      candidateCount: input.sanitizedDeletionCandidateRefs.length,
      requiredVerificationCommandCount: input.requiredVerificationCommands.length,
      rollbackNoteCount: input.rollbackNotes.length,
      nextAllowedAction: "provide_cleanup_deletion_dry_run_receipt_ref",
    })
  }
  if (!SAFE_OPERATOR_DRY_RUN_RECEIPT_REF.test(receiptRef)) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_receipt_ref_invalid",
      reviewedAdmissionStatus: "accepted",
      candidateCount: input.sanitizedDeletionCandidateRefs.length,
      requiredVerificationCommandCount: input.requiredVerificationCommands.length,
      rollbackNoteCount: input.rollbackNotes.length,
      nextAllowedAction: "provide_cleanup_deletion_dry_run_receipt_ref",
    })
  }
  if (input.sanitizedDeletionCandidateRefs.length === 0) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_no_candidates",
      reviewedAdmissionStatus: "accepted",
      requiredVerificationCommandCount: input.requiredVerificationCommands.length,
      rollbackNoteCount: input.rollbackNotes.length,
      nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
    })
  }
  if (
    input.sanitizedDeletionCandidateRefs.some((candidateRef) =>
      !SAFE_SANITIZED_DELETION_CANDIDATE_REF.test(candidateRef.trim()),
    )
  ) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_candidate_ref_invalid",
      reviewedAdmissionStatus: "accepted",
      candidateCount: input.sanitizedDeletionCandidateRefs.length,
      requiredVerificationCommandCount: input.requiredVerificationCommands.length,
      rollbackNoteCount: input.rollbackNotes.length,
      nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
    })
  }

  return {
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.v1",
    method: "browser.active_tab_info",
    dryRunStatus: "ready",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_ready",
    reviewedAdmissionStatus: "accepted",
    dryRunReceiptId: buildDryRunReceiptId(receiptRef),
    candidateCount: input.sanitizedDeletionCandidateRefs.length,
    requiredVerificationCommandCount: input.requiredVerificationCommands.length,
    rollbackNoteCount: input.rollbackNotes.length,
    nextAllowedAction: "review_cleanup_deletion_dry_run_receipt",
    runGitNow: false,
    deleteCodeNow: false,
    modifyPackageNow: false,
    createBranchNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}
