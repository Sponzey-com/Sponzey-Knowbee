export type CleanupDataKind = "artifact" | "audit_log" | "diagnostic_event" | "run_history" | "memory" | "temporary_file" | "generated_artifact" | "other";
export type CleanupRetentionClass = "expired" | "quota_eligible" | "temporary" | "standard" | "permanent";
export interface CleanupCandidateEvidence {
    candidateId: string;
    dataKind: CleanupDataKind;
    retentionClass: CleanupRetentionClass;
    activeReferenceCount?: number;
    referenceScanCompleted?: boolean;
    migrationRequired?: boolean;
    rollbackRequired?: boolean;
    deletionApproved?: boolean;
}
export type CleanupRetentionReasonCode = "candidate_id_missing" | "reference_scan_incomplete" | "active_reference_count_unknown" | "active_reference_present" | "permanent_retention" | "retention_not_expired" | "migration_review_missing" | "migration_required" | "rollback_review_missing" | "rollback_required" | "deletion_approval_missing";
export type CleanupDecision = {
    decision: "delete";
    candidateId: string;
    reasonCodes: ["cleanup_evidence_complete"];
} | {
    decision: "retain";
    candidateId: string;
    reasonCodes: CleanupRetentionReasonCode[];
};
export declare function decideCleanupCandidate(evidence: CleanupCandidateEvidence): CleanupDecision;
export type CleanupReferenceBoundary = "runtime" | "test" | "prompt_registry" | "data_migration" | "user_data_retention" | "deployment_artifact";
export interface CleanupReferenceReceipt {
    checked: boolean;
    checkerId: string;
    snapshotId: string;
    checkedAt: number;
    activeReferenceCount: number;
}
export type CleanupReferenceReceipts = Record<CleanupReferenceBoundary, CleanupReferenceReceipt>;
export type CleanupProtectionClass = "unprotected" | "active_user_data" | "audit_log" | "migration_required" | "rollback_required" | "classification_unknown";
export interface CleanupRetentionDisposition {
    policyVersion: string;
    evidence: string;
    disposition: "deletion_allowed";
    validUntil?: number;
}
export interface CleanupApprovalReceipt {
    approvalId: string;
    artifactId: string;
    scope: "delete";
    policyVersion: string;
    approvedAt: number;
    expiresAt: number;
}
export type CleanupRecoveryStrategy = "restore_from_source" | "restore_from_backup" | "reverse_migration" | "not_recoverable";
export interface ProtectedCleanupPlan {
    artifactId: string;
    canonicalOwner: string;
    referenceReceipts: CleanupReferenceReceipts;
    protectionClass: CleanupProtectionClass;
    retentionDisposition?: CleanupRetentionDisposition;
    approval?: CleanupApprovalReceipt;
    legalOrAuditHold: boolean;
    retentionUntil?: number;
    affectedConsumers: string[];
    recoveryStrategy: CleanupRecoveryStrategy;
    recoveryTarget?: string;
    reproducible: boolean;
    postDeletionChecks: string[];
    policyVersion: string;
    evaluatedAt: number;
}
export type ProtectedCleanupReasonCode = "artifact_id_missing" | "canonical_owner_missing" | "reference_boundary_missing" | "reference_check_incomplete" | "reference_receipt_invalid" | "active_reference_present" | "protection_class_unknown" | "retention_or_approval_missing" | "retention_policy_mismatch" | "approval_invalid" | "hold_active" | "retention_period_active" | "affected_consumers_present" | "recovery_target_missing" | "irrecoverable_artifact_not_approved" | "post_deletion_checks_missing";
export type ProtectedCleanupDecision = {
    decision: "deletion_eligible";
    artifactId: string;
    reasonCodes: ["protected_cleanup_evidence_complete"];
} | {
    decision: "retain";
    artifactId: string;
    reasonCodes: ProtectedCleanupReasonCode[];
};
export declare function evaluateProtectedCleanupPlan(plan: ProtectedCleanupPlan): ProtectedCleanupDecision;
export declare function applyProtectedCleanupPlan(input: {
    plan: ProtectedCleanupPlan;
    decision: ProtectedCleanupDecision;
    deleteArtifact: (artifactId: string) => Promise<void>;
}): Promise<{
    status: "deleted" | "retained";
    artifactId: string;
}>;
export interface CleanupDeletionReceipt {
    decisionId: string;
    artifactId: string;
    canonicalOwner: string;
    preDeletionSnapshotId: string;
    deletedAt: number;
}
export type CleanupValidationKind = "focused_test" | "static_reference";
export interface CleanupValidationReceipt {
    kind: CleanupValidationKind;
    receiptId: string;
    checkedAt: number;
    passed: boolean;
}
export interface CleanupTraceTransition {
    from: "deletion_eligible" | "deleted" | "verifying";
    event: "delete_applied" | "verification_started" | "verification_passed" | "verification_failed";
    to: "deleted" | "verifying" | "verified" | "recovery_required";
    receiptId: string;
}
export interface CleanupRecoveryRequest {
    artifactId: string;
    strategy: CleanupRecoveryStrategy;
    recoveryTarget: string;
    failedBoundaries: CleanupReferenceBoundary[];
    postDeletionSnapshotIds: string[];
}
export type PostDeletionVerificationReasonCode = "decision_id_missing" | "deletion_receipt_target_mismatch" | "deletion_receipt_owner_mismatch" | "post_delete_boundary_missing" | "post_delete_snapshot_not_fresh" | "post_delete_reference_present" | "validation_receipt_missing" | "validation_receipt_invalid" | "validation_failed" | "recovery_target_missing";
export type PostDeletionVerificationDecision = {
    status: "verified";
    artifactId: string;
    trace: CleanupTraceTransition[];
    reasonCodes: ["post_deletion_verification_complete"];
} | {
    status: "recovery_required" | "rejected";
    artifactId: string;
    trace: CleanupTraceTransition[];
    reasonCodes: PostDeletionVerificationReasonCode[];
    recovery?: CleanupRecoveryRequest;
};
export declare function evaluatePostDeletionVerification(input: {
    plan: ProtectedCleanupPlan;
    deletionReceipt: CleanupDeletionReceipt;
    postDeletionReferences: CleanupReferenceReceipts;
    validations: CleanupValidationReceipt[];
}): PostDeletionVerificationDecision;
//# sourceMappingURL=cleanup-decision.d.ts.map