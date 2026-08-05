export declare const CLEANUP_ARTIFACT_KINDS: readonly ["code", "prompt", "file", "data", "configuration", "documentation", "test_fixture", "generated_artifact", "temporary_artifact", "backup", "ui_asset"];
export declare const CLEANUP_REFERENCE_SCOPES: readonly ["runtime", "test", "prompt_registry", "migration", "user_retention", "deployment"];
export declare const PROTECTED_CLEANUP_DATA_KINDS: readonly ["active_user_data", "audit_log", "migration_required_data", "rollback_required_data"];
export type CleanupArtifactKind = typeof CLEANUP_ARTIFACT_KINDS[number];
export type CleanupReferenceScope = typeof CLEANUP_REFERENCE_SCOPES[number];
export type ProtectedCleanupDataKind = typeof PROTECTED_CLEANUP_DATA_KINDS[number];
export interface CleanupCandidateReceipt {
    artifactId: string;
    kind: CleanupArtifactKind;
    canonicalPath: string;
    checksum: string;
    owner: string;
    scannerId: string;
    observedUnusedAt: number;
    unusedEvidenceRefs: readonly string[];
}
export interface ArtifactCleanupReferenceReceipt {
    artifactId: string;
    scope: CleanupReferenceScope;
    snapshotId: string;
    checkedAt: number;
    status: "clear" | "referenced";
    evidenceRef: string;
}
export interface CleanupProtectedDataReceipt {
    artifactId: string;
    classification: "unprotected" | ProtectedCleanupDataKind;
    active: boolean;
    retentionDisposition: "not_applicable" | "retained" | "expired";
    evidenceRef: string;
}
export interface CleanupDeletionApprovalReceipt {
    artifactId: string;
    checksum: string;
    approvedBy: string;
    approvalRef: string;
}
export type ArtifactCleanupDecision = {
    status: "authorized";
    artifactId: string;
    canonicalPath: string;
    checksum: string;
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "cleanup_candidate_invalid" | "unused_evidence_insufficient" | "reference_receipt_missing" | "reference_snapshot_mismatch" | "reference_receipt_stale" | "artifact_still_referenced" | "protected_data_receipt_invalid" | "protected_data_retained";
    scope?: CleanupReferenceScope;
};
export declare function authorizeArtifactCleanup(input: {
    candidate: CleanupCandidateReceipt;
    references: readonly ArtifactCleanupReferenceReceipt[];
    protectedData: CleanupProtectedDataReceipt;
    approval?: CleanupDeletionApprovalReceipt;
    expectedSnapshotId: string;
    now: number;
    maxReferenceAgeMs: number;
}): ArtifactCleanupDecision;
export declare function deleteAuthorizedArtifact<T>(input: {
    decision: ArtifactCleanupDecision;
    writerArtifactId: string;
    writerChecksum: string;
    remove: (authorization: Extract<ArtifactCleanupDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "deleted";
    result: T;
} | Extract<ArtifactCleanupDecision, {
    status: "blocked";
}> | {
    status: "blocked";
    reasonCode: "cleanup_writer_mismatch";
}>;
//# sourceMappingURL=artifact-cleanup-authorization.d.ts.map