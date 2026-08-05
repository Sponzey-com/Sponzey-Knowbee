export type CleanupDataKind =
  | "artifact"
  | "audit_log"
  | "diagnostic_event"
  | "run_history"
  | "memory"
  | "temporary_file"
  | "generated_artifact"
  | "other"

export type CleanupRetentionClass = "expired" | "quota_eligible" | "temporary" | "standard" | "permanent"

export interface CleanupCandidateEvidence {
  candidateId: string
  dataKind: CleanupDataKind
  retentionClass: CleanupRetentionClass
  activeReferenceCount?: number
  referenceScanCompleted?: boolean
  migrationRequired?: boolean
  rollbackRequired?: boolean
  deletionApproved?: boolean
}

export type CleanupRetentionReasonCode =
  | "candidate_id_missing"
  | "reference_scan_incomplete"
  | "active_reference_count_unknown"
  | "active_reference_present"
  | "permanent_retention"
  | "retention_not_expired"
  | "migration_review_missing"
  | "migration_required"
  | "rollback_review_missing"
  | "rollback_required"
  | "deletion_approval_missing"

export type CleanupDecision =
  | {
      decision: "delete"
      candidateId: string
      reasonCodes: ["cleanup_evidence_complete"]
    }
  | {
      decision: "retain"
      candidateId: string
      reasonCodes: CleanupRetentionReasonCode[]
    }

export function decideCleanupCandidate(evidence: CleanupCandidateEvidence): CleanupDecision {
  const candidateId = evidence.candidateId.trim()
  const reasonCodes: CleanupRetentionReasonCode[] = []

  if (!candidateId) reasonCodes.push("candidate_id_missing")
  if (evidence.referenceScanCompleted !== true) reasonCodes.push("reference_scan_incomplete")
  if (evidence.activeReferenceCount === undefined) {
    reasonCodes.push("active_reference_count_unknown")
  } else if (!Number.isInteger(evidence.activeReferenceCount) || evidence.activeReferenceCount < 0) {
    reasonCodes.push("active_reference_count_unknown")
  } else if (evidence.activeReferenceCount > 0) {
    reasonCodes.push("active_reference_present")
  }
  if (evidence.retentionClass === "permanent") reasonCodes.push("permanent_retention")
  if (evidence.retentionClass === "standard") reasonCodes.push("retention_not_expired")
  if (evidence.migrationRequired === undefined) {
    reasonCodes.push("migration_review_missing")
  } else if (evidence.migrationRequired) {
    reasonCodes.push("migration_required")
  }
  if (evidence.rollbackRequired === undefined) {
    reasonCodes.push("rollback_review_missing")
  } else if (evidence.rollbackRequired) {
    reasonCodes.push("rollback_required")
  }
  if (evidence.deletionApproved !== true) reasonCodes.push("deletion_approval_missing")

  if (reasonCodes.length > 0) {
    return { decision: "retain", candidateId, reasonCodes }
  }
  return { decision: "delete", candidateId, reasonCodes: ["cleanup_evidence_complete"] }
}

export type CleanupReferenceBoundary =
  | "runtime"
  | "test"
  | "prompt_registry"
  | "data_migration"
  | "user_data_retention"
  | "deployment_artifact"

export interface CleanupReferenceReceipt {
  checked: boolean
  checkerId: string
  snapshotId: string
  checkedAt: number
  activeReferenceCount: number
}

export type CleanupReferenceReceipts = Record<CleanupReferenceBoundary, CleanupReferenceReceipt>

export type CleanupProtectionClass =
  | "unprotected"
  | "active_user_data"
  | "audit_log"
  | "migration_required"
  | "rollback_required"
  | "classification_unknown"

export interface CleanupRetentionDisposition {
  policyVersion: string
  evidence: string
  disposition: "deletion_allowed"
  validUntil?: number
}

export interface CleanupApprovalReceipt {
  approvalId: string
  artifactId: string
  scope: "delete"
  policyVersion: string
  approvedAt: number
  expiresAt: number
}

export type CleanupRecoveryStrategy =
  | "restore_from_source"
  | "restore_from_backup"
  | "reverse_migration"
  | "not_recoverable"

export interface ProtectedCleanupPlan {
  artifactId: string
  canonicalOwner: string
  referenceReceipts: CleanupReferenceReceipts
  protectionClass: CleanupProtectionClass
  retentionDisposition?: CleanupRetentionDisposition
  approval?: CleanupApprovalReceipt
  legalOrAuditHold: boolean
  retentionUntil?: number
  affectedConsumers: string[]
  recoveryStrategy: CleanupRecoveryStrategy
  recoveryTarget?: string
  reproducible: boolean
  postDeletionChecks: string[]
  policyVersion: string
  evaluatedAt: number
}

export type ProtectedCleanupReasonCode =
  | "artifact_id_missing"
  | "canonical_owner_missing"
  | "reference_boundary_missing"
  | "reference_check_incomplete"
  | "reference_receipt_invalid"
  | "active_reference_present"
  | "protection_class_unknown"
  | "retention_or_approval_missing"
  | "retention_policy_mismatch"
  | "approval_invalid"
  | "hold_active"
  | "retention_period_active"
  | "affected_consumers_present"
  | "recovery_target_missing"
  | "irrecoverable_artifact_not_approved"
  | "post_deletion_checks_missing"

export type ProtectedCleanupDecision =
  | {
      decision: "deletion_eligible"
      artifactId: string
      reasonCodes: ["protected_cleanup_evidence_complete"]
    }
  | {
      decision: "retain"
      artifactId: string
      reasonCodes: ProtectedCleanupReasonCode[]
    }

const REQUIRED_CLEANUP_REFERENCE_BOUNDARIES: readonly CleanupReferenceBoundary[] = [
  "runtime",
  "test",
  "prompt_registry",
  "data_migration",
  "user_data_retention",
  "deployment_artifact",
]

const RECOVERABLE_STRATEGIES: readonly CleanupRecoveryStrategy[] = [
  "restore_from_source",
  "restore_from_backup",
  "reverse_migration",
]

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function validApproval(plan: ProtectedCleanupPlan): boolean {
  const approval = plan.approval
  return approval !== undefined
    && nonEmpty(approval.approvalId)
    && approval.artifactId === plan.artifactId.trim()
    && approval.scope === "delete"
    && approval.policyVersion === plan.policyVersion
    && Number.isFinite(approval.approvedAt)
    && Number.isFinite(approval.expiresAt)
    && approval.approvedAt <= plan.evaluatedAt
    && approval.expiresAt >= plan.evaluatedAt
}

export function evaluateProtectedCleanupPlan(
  plan: ProtectedCleanupPlan,
): ProtectedCleanupDecision {
  const artifactId = plan.artifactId.trim()
  const reasonCodes: ProtectedCleanupReasonCode[] = []

  if (!artifactId) reasonCodes.push("artifact_id_missing")
  if (!nonEmpty(plan.canonicalOwner)) reasonCodes.push("canonical_owner_missing")

  for (const boundary of REQUIRED_CLEANUP_REFERENCE_BOUNDARIES) {
    const receipt = plan.referenceReceipts?.[boundary]
    if (!receipt) {
      reasonCodes.push("reference_boundary_missing")
      continue
    }
    if (receipt.checked !== true) reasonCodes.push("reference_check_incomplete")
    if (
      !nonEmpty(receipt.checkerId)
      || !nonEmpty(receipt.snapshotId)
      || !Number.isFinite(receipt.checkedAt)
      || !Number.isInteger(receipt.activeReferenceCount)
      || receipt.activeReferenceCount < 0
    ) {
      reasonCodes.push("reference_receipt_invalid")
    } else if (receipt.activeReferenceCount > 0) {
      reasonCodes.push("active_reference_present")
    }
  }

  if (plan.protectionClass === "classification_unknown") {
    reasonCodes.push("protection_class_unknown")
  }

  const isProtected = plan.protectionClass !== "unprotected"
    && plan.protectionClass !== "classification_unknown"
  const disposition = plan.retentionDisposition
  const hasDisposition = disposition !== undefined
    && disposition.disposition === "deletion_allowed"
    && nonEmpty(disposition.evidence)
    && disposition.policyVersion === plan.policyVersion
    && (disposition.validUntil === undefined || disposition.validUntil >= plan.evaluatedAt)
  const approvalIsValid = validApproval(plan)

  if (isProtected && !hasDisposition && !approvalIsValid) {
    reasonCodes.push("retention_or_approval_missing")
  }
  if (disposition !== undefined && !hasDisposition) {
    reasonCodes.push("retention_policy_mismatch")
  }
  if (plan.approval !== undefined && !approvalIsValid) {
    reasonCodes.push("approval_invalid")
  }
  if (plan.legalOrAuditHold) reasonCodes.push("hold_active")
  if (plan.retentionUntil !== undefined && plan.retentionUntil > plan.evaluatedAt) {
    reasonCodes.push("retention_period_active")
  }
  if (plan.affectedConsumers.some((consumer) => nonEmpty(consumer))) {
    reasonCodes.push("affected_consumers_present")
  }
  if (
    RECOVERABLE_STRATEGIES.includes(plan.recoveryStrategy)
    && !nonEmpty(plan.recoveryTarget)
  ) {
    reasonCodes.push("recovery_target_missing")
  }
  if (
    plan.recoveryStrategy === "not_recoverable"
    && (!plan.reproducible || isProtected || !approvalIsValid)
  ) {
    reasonCodes.push("irrecoverable_artifact_not_approved")
  }
  if (plan.postDeletionChecks.length === 0 || plan.postDeletionChecks.some((check) => !nonEmpty(check))) {
    reasonCodes.push("post_deletion_checks_missing")
  }

  if (reasonCodes.length > 0) {
    return { decision: "retain", artifactId, reasonCodes: [...new Set(reasonCodes)] }
  }
  return {
    decision: "deletion_eligible",
    artifactId,
    reasonCodes: ["protected_cleanup_evidence_complete"],
  }
}

export async function applyProtectedCleanupPlan(input: {
  plan: ProtectedCleanupPlan
  decision: ProtectedCleanupDecision
  deleteArtifact: (artifactId: string) => Promise<void>
}): Promise<{ status: "deleted" | "retained"; artifactId: string }> {
  const currentDecision = evaluateProtectedCleanupPlan(input.plan)
  if (
    input.decision.decision !== "deletion_eligible"
    || currentDecision.decision !== "deletion_eligible"
    || input.decision.artifactId !== currentDecision.artifactId
  ) {
    return { status: "retained", artifactId: currentDecision.artifactId }
  }
  await input.deleteArtifact(currentDecision.artifactId)
  return { status: "deleted", artifactId: currentDecision.artifactId }
}

export interface CleanupDeletionReceipt {
  decisionId: string
  artifactId: string
  canonicalOwner: string
  preDeletionSnapshotId: string
  deletedAt: number
}

export type CleanupValidationKind = "focused_test" | "static_reference"

export interface CleanupValidationReceipt {
  kind: CleanupValidationKind
  receiptId: string
  checkedAt: number
  passed: boolean
}

export interface CleanupTraceTransition {
  from: "deletion_eligible" | "deleted" | "verifying"
  event: "delete_applied" | "verification_started" | "verification_passed" | "verification_failed"
  to: "deleted" | "verifying" | "verified" | "recovery_required"
  receiptId: string
}

export interface CleanupRecoveryRequest {
  artifactId: string
  strategy: CleanupRecoveryStrategy
  recoveryTarget: string
  failedBoundaries: CleanupReferenceBoundary[]
  postDeletionSnapshotIds: string[]
}

export type PostDeletionVerificationReasonCode =
  | "decision_id_missing"
  | "deletion_receipt_target_mismatch"
  | "deletion_receipt_owner_mismatch"
  | "post_delete_boundary_missing"
  | "post_delete_snapshot_not_fresh"
  | "post_delete_reference_present"
  | "validation_receipt_missing"
  | "validation_receipt_invalid"
  | "validation_failed"
  | "recovery_target_missing"

export type PostDeletionVerificationDecision =
  | {
      status: "verified"
      artifactId: string
      trace: CleanupTraceTransition[]
      reasonCodes: ["post_deletion_verification_complete"]
    }
  | {
      status: "recovery_required" | "rejected"
      artifactId: string
      trace: CleanupTraceTransition[]
      reasonCodes: PostDeletionVerificationReasonCode[]
      recovery?: CleanupRecoveryRequest
    }

export function evaluatePostDeletionVerification(input: {
  plan: ProtectedCleanupPlan
  deletionReceipt: CleanupDeletionReceipt
  postDeletionReferences: CleanupReferenceReceipts
  validations: CleanupValidationReceipt[]
}): PostDeletionVerificationDecision {
  const artifactId = input.plan.artifactId.trim()
  const receipt = input.deletionReceipt
  const reasonCodes: PostDeletionVerificationReasonCode[] = []
  const failedBoundaries: CleanupReferenceBoundary[] = []

  if (!nonEmpty(receipt.decisionId)) reasonCodes.push("decision_id_missing")
  if (receipt.artifactId !== artifactId) reasonCodes.push("deletion_receipt_target_mismatch")
  if (receipt.canonicalOwner !== input.plan.canonicalOwner.trim()) {
    reasonCodes.push("deletion_receipt_owner_mismatch")
  }

  for (const boundary of REQUIRED_CLEANUP_REFERENCE_BOUNDARIES) {
    const postReceipt = input.postDeletionReferences?.[boundary]
    if (!postReceipt || postReceipt.checked !== true) {
      reasonCodes.push("post_delete_boundary_missing")
      failedBoundaries.push(boundary)
      continue
    }
    if (
      !nonEmpty(postReceipt.snapshotId)
      || postReceipt.snapshotId === receipt.preDeletionSnapshotId
      || postReceipt.checkedAt <= receipt.deletedAt
    ) {
      reasonCodes.push("post_delete_snapshot_not_fresh")
      failedBoundaries.push(boundary)
    }
    if (!Number.isInteger(postReceipt.activeReferenceCount) || postReceipt.activeReferenceCount > 0) {
      reasonCodes.push("post_delete_reference_present")
      failedBoundaries.push(boundary)
    }
  }

  for (const kind of ["focused_test", "static_reference"] as const) {
    const validation = input.validations.find((candidate) => candidate.kind === kind)
    if (!validation) {
      reasonCodes.push("validation_receipt_missing")
    } else if (!nonEmpty(validation.receiptId) || validation.checkedAt <= receipt.deletedAt) {
      reasonCodes.push("validation_receipt_invalid")
    } else if (!validation.passed) {
      reasonCodes.push("validation_failed")
    }
  }

  const baseTrace: CleanupTraceTransition[] = [
    {
      from: "deletion_eligible",
      event: "delete_applied",
      to: "deleted",
      receiptId: receipt.decisionId,
    },
    {
      from: "deleted",
      event: "verification_started",
      to: "verifying",
      receiptId: receipt.decisionId,
    },
  ]

  const uniqueReasons = [...new Set(reasonCodes)]
  const identityRejected = uniqueReasons.some((reason) =>
    reason === "decision_id_missing"
    || reason === "deletion_receipt_target_mismatch"
    || reason === "deletion_receipt_owner_mismatch")
  if (identityRejected) {
    return { status: "rejected", artifactId, trace: [], reasonCodes: uniqueReasons }
  }
  if (uniqueReasons.length > 0) {
    const recoveryTarget = input.plan.recoveryTarget?.trim() ?? ""
    if (!recoveryTarget) uniqueReasons.push("recovery_target_missing")
    const failureReceipt = input.validations.find((validation) => nonEmpty(validation.receiptId))?.receiptId
      ?? receipt.decisionId
    const trace = [...baseTrace, {
      from: "verifying" as const,
      event: "verification_failed" as const,
      to: "recovery_required" as const,
      receiptId: failureReceipt,
    }]
    return {
      status: "recovery_required",
      artifactId,
      trace,
      reasonCodes: [...new Set(uniqueReasons)],
      ...(recoveryTarget ? {
        recovery: {
          artifactId,
          strategy: input.plan.recoveryStrategy,
          recoveryTarget,
          failedBoundaries: [...new Set(failedBoundaries)],
          postDeletionSnapshotIds: REQUIRED_CLEANUP_REFERENCE_BOUNDARIES.flatMap((boundary) => {
            const snapshotId = input.postDeletionReferences?.[boundary]?.snapshotId
            return nonEmpty(snapshotId) ? [snapshotId] : []
          }),
        },
      } : {}),
    }
  }

  return {
    status: "verified",
    artifactId,
    trace: [...baseTrace, {
      from: "verifying",
      event: "verification_passed",
      to: "verified",
      receiptId: input.validations.map((validation) => validation.receiptId).join("+"),
    }],
    reasonCodes: ["post_deletion_verification_complete"],
  }
}
