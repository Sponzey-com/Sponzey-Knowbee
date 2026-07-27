export const CLEANUP_ARTIFACT_KINDS = [
    "code",
    "prompt",
    "file",
    "data",
    "configuration",
    "documentation",
    "test_fixture",
    "generated_artifact",
    "temporary_artifact",
    "backup",
    "ui_asset",
];
export const CLEANUP_REFERENCE_SCOPES = [
    "runtime",
    "test",
    "prompt_registry",
    "migration",
    "user_retention",
    "deployment",
];
export const PROTECTED_CLEANUP_DATA_KINDS = [
    "active_user_data",
    "audit_log",
    "migration_required_data",
    "rollback_required_data",
];
function exact(value) {
    return value.trim();
}
function uniqueNonEmpty(values) {
    const normalized = values.map(exact);
    return normalized.length >= 2 && normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}
export function authorizeArtifactCleanup(input) {
    const candidate = input.candidate;
    if (!CLEANUP_ARTIFACT_KINDS.includes(candidate.kind) || !exact(candidate.artifactId)
        || !exact(candidate.canonicalPath) || !exact(candidate.checksum) || !exact(candidate.owner)
        || !exact(candidate.scannerId) || !Number.isSafeInteger(candidate.observedUnusedAt)
        || candidate.observedUnusedAt < 0 || candidate.observedUnusedAt > input.now) {
        return { status: "blocked", reasonCode: "cleanup_candidate_invalid" };
    }
    if (!uniqueNonEmpty(candidate.unusedEvidenceRefs)) {
        return { status: "blocked", reasonCode: "unused_evidence_insufficient" };
    }
    const references = new Map();
    for (const receipt of input.references) {
        if (!CLEANUP_REFERENCE_SCOPES.includes(receipt.scope) || references.has(receipt.scope)
            || receipt.artifactId !== candidate.artifactId || !exact(receipt.evidenceRef)) {
            return { status: "blocked", reasonCode: "reference_receipt_missing", scope: receipt.scope };
        }
        references.set(receipt.scope, receipt);
    }
    for (const scope of CLEANUP_REFERENCE_SCOPES) {
        const receipt = references.get(scope);
        if (!receipt)
            return { status: "blocked", reasonCode: "reference_receipt_missing", scope };
        if (receipt.snapshotId !== input.expectedSnapshotId) {
            return { status: "blocked", reasonCode: "reference_snapshot_mismatch", scope };
        }
        if (!Number.isSafeInteger(receipt.checkedAt) || receipt.checkedAt > input.now
            || input.now - receipt.checkedAt > input.maxReferenceAgeMs) {
            return { status: "blocked", reasonCode: "reference_receipt_stale", scope };
        }
        if (receipt.status !== "clear")
            return { status: "blocked", reasonCode: "artifact_still_referenced", scope };
    }
    const protectedData = input.protectedData;
    if (protectedData.artifactId !== candidate.artifactId || !exact(protectedData.evidenceRef)
        || (protectedData.classification === "unprotected" && (protectedData.active || protectedData.retentionDisposition !== "not_applicable"))) {
        return { status: "blocked", reasonCode: "protected_data_receipt_invalid" };
    }
    if (protectedData.classification !== "unprotected") {
        const approved = input.approval?.artifactId === candidate.artifactId
            && input.approval.checksum === candidate.checksum
            && Boolean(exact(input.approval.approvedBy)) && Boolean(exact(input.approval.approvalRef));
        if (protectedData.retentionDisposition !== "expired" && !approved) {
            return { status: "blocked", reasonCode: "protected_data_retained" };
        }
    }
    return {
        status: "authorized",
        artifactId: candidate.artifactId,
        canonicalPath: candidate.canonicalPath,
        checksum: candidate.checksum,
        evidenceRefs: [...candidate.unusedEvidenceRefs, ...CLEANUP_REFERENCE_SCOPES.map((scope) => references.get(scope).evidenceRef), protectedData.evidenceRef],
    };
}
export async function deleteAuthorizedArtifact(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    if (input.writerArtifactId !== input.decision.artifactId || input.writerChecksum !== input.decision.checksum) {
        return { status: "blocked", reasonCode: "cleanup_writer_mismatch" };
    }
    return { status: "deleted", result: await input.remove(input.decision) };
}
//# sourceMappingURL=artifact-cleanup-authorization.js.map