export const DUPLICATE_ARTIFACT_CATEGORIES = ["implementation", "prompt", "schema", "documentation"];
export const TEMPORARY_ARTIFACT_KINDS = ["compatibility_code", "temporary_prompt", "experiment", "backup"];
export const TEMPORARY_REMOVAL_CONDITIONS = ["date_reached", "replacement_verified", "experiment_closed", "backup_retention_elapsed"];
export const INDIRECT_IMPLEMENTATION_KINDS = ["wrapper", "duplicate_adapter", "hidden_global_state"];
function exact(value) {
    return value?.trim() ?? "";
}
function blocked(reasonCode, subjectId) {
    return subjectId ? { status: "blocked", reasonCode, subjectId } : { status: "blocked", reasonCode };
}
export function authorizeCanonicalArtifactConsolidation(group) {
    if (!exact(group.responsibilityId) || !DUPLICATE_ARTIFACT_CATEGORIES.includes(group.category)
        || !exact(group.canonicalArtifactId) || !exact(group.owner) || group.artifacts.length < 2) {
        return blocked("canonical_group_invalid", exact(group.responsibilityId));
    }
    const ids = new Set();
    for (const artifact of group.artifacts) {
        if (!exact(artifact.artifactId) || ids.has(artifact.artifactId) || !exact(artifact.evidenceRef)) {
            return blocked("canonical_group_invalid", artifact.artifactId);
        }
        ids.add(artifact.artifactId);
    }
    const canonical = group.artifacts.filter((artifact) => artifact.role === "canonical");
    if (canonical.length !== 1 || canonical[0]?.artifactId !== group.canonicalArtifactId
        || canonical[0].disposition !== "retain") {
        return blocked("canonical_owner_ambiguous", group.responsibilityId);
    }
    for (const artifact of group.artifacts.filter((entry) => entry.role === "duplicate")) {
        if (artifact.disposition === "retain")
            return blocked("duplicate_disposition_invalid", artifact.artifactId);
        if (artifact.disposition === "migrate" && artifact.migrationTargetArtifactId !== group.canonicalArtifactId) {
            return blocked("migration_target_invalid", artifact.artifactId);
        }
        if (artifact.disposition === "remove" && exact(artifact.migrationTargetArtifactId)) {
            return blocked("migration_target_invalid", artifact.artifactId);
        }
    }
    return { status: "authorized", action: "consolidate", subjectId: group.responsibilityId };
}
export function authorizeTemporaryArtifactDisposition(input) {
    const receipt = input.receipt;
    if (!exact(receipt.artifactId) || !TEMPORARY_ARTIFACT_KINDS.includes(receipt.kind) || !exact(receipt.owner)
        || !Number.isSafeInteger(receipt.createdAt) || !Number.isSafeInteger(receipt.expiresAt)
        || receipt.createdAt < 0 || receipt.expiresAt <= receipt.createdAt
        || !TEMPORARY_REMOVAL_CONDITIONS.includes(receipt.removalCondition) || !exact(receipt.evidenceRef)) {
        return blocked("temporary_lifecycle_invalid", exact(receipt.artifactId));
    }
    const removalDue = input.now >= receipt.expiresAt || receipt.removalConditionSatisfied;
    if (removalDue && receipt.disposition !== "remove")
        return blocked("temporary_expired_but_retained", receipt.artifactId);
    if (!removalDue && receipt.disposition === "remove")
        return blocked("temporary_removal_premature", receipt.artifactId);
    return { status: "authorized", action: removalDue ? "remove_temporary" : "retain_temporary", subjectId: receipt.artifactId };
}
export function authorizeIndirectImplementation(assessment) {
    if (!exact(assessment.assessmentId) || !INDIRECT_IMPLEMENTATION_KINDS.includes(assessment.kind)
        || !Number.isSafeInteger(assessment.complexityRemoved) || assessment.complexityRemoved < 0
        || !Number.isSafeInteger(assessment.duplicationRemoved) || assessment.duplicationRemoved < 0
        || !exact(assessment.justification) || !exact(assessment.evidenceRef)) {
        return blocked("indirection_assessment_invalid", exact(assessment.assessmentId));
    }
    if (assessment.kind === "hidden_global_state" && assessment.proposedDisposition === "add_indirection") {
        return blocked("hidden_global_state_forbidden", assessment.assessmentId);
    }
    if (assessment.proposedDisposition === "use_direct") {
        return { status: "authorized", action: "use_direct", subjectId: assessment.assessmentId };
    }
    const meaningfulBenefit = assessment.complexityRemoved > 0 || assessment.duplicationRemoved > 0 || Boolean(exact(assessment.standardBoundaryId));
    if (assessment.directImplementationSufficient || !meaningfulBenefit) {
        return blocked("unnecessary_indirection", assessment.assessmentId);
    }
    return { status: "authorized", action: "add_indirection", subjectId: assessment.assessmentId };
}
export async function applyMaintenanceSimplification(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "applied", result: await input.apply(input.decision) };
}
//# sourceMappingURL=maintenance-simplification-policy.js.map