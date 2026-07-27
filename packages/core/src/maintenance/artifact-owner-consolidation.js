function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function unique(values, field) {
    const normalized = values.map((value) => required(value, field));
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} values must be unique.`);
    return normalized;
}
export function evaluateArtifactOwnerConsolidation(input) {
    const purposeId = required(input.purposeId, "Purpose ID");
    const snapshotVersion = required(input.snapshotVersion, "Snapshot version");
    const artifactIds = unique(input.owners.map((owner) => owner.artifactId), "Artifact ID");
    const canonicalOwners = input.owners.filter((owner) => owner.canonical);
    if (canonicalOwners.length !== 1)
        throw new Error("A purpose must have exactly one canonical artifact owner.");
    const canonicalOwner = canonicalOwners[0];
    if (!canonicalOwner)
        throw new Error("A purpose must have exactly one canonical artifact owner.");
    const canonicalArtifactId = required(canonicalOwner.artifactId, "Canonical artifact ID");
    const removals = [];
    const migrations = [];
    const retentions = [];
    for (const owner of input.owners) {
        const artifactId = required(owner.artifactId, "Artifact ID");
        const activeConsumerIds = unique(owner.activeConsumerIds, "Active consumer ID");
        if (owner.canonical) {
            if (owner.disposition)
                throw new Error("Canonical artifact owner cannot have a removal disposition.");
            continue;
        }
        const disposition = owner.disposition;
        if (!disposition)
            throw new Error(`Non-canonical artifact ${artifactId} requires a disposition.`);
        if (disposition.kind === "remove") {
            if (activeConsumerIds.length > 0)
                throw new Error("An artifact with an active consumer cannot be removed.");
            removals.push(artifactId);
            continue;
        }
        if (disposition.kind === "migrate") {
            const targetArtifactId = required(disposition.targetArtifactId, "Migration target artifact ID");
            if (targetArtifactId !== canonicalArtifactId || !artifactIds.includes(targetArtifactId)) {
                throw new Error("Migration target must be the canonical artifact owner.");
            }
            const migrationEvidenceRefs = unique(disposition.migrationEvidenceRefs, "Migration evidence reference");
            if (migrationEvidenceRefs.length === 0)
                throw new Error("Migration evidence is required.");
            migrations.push({ artifactId, targetArtifactId, migrationEvidenceRefs });
            continue;
        }
        retentions.push({
            artifactId,
            owner: required(disposition.owner, "Retention owner"),
            expiryCondition: required(disposition.expiryCondition, "Retention expiry condition"),
        });
    }
    return {
        status: "eligible",
        purposeId,
        snapshotVersion,
        canonicalArtifactId,
        removals,
        migrations,
        retentions,
    };
}
export async function applyArtifactOwnerConsolidation(input) {
    for (const migration of input.decision.migrations)
        await input.migrate(migration);
    for (const artifactId of input.decision.removals)
        await input.remove(artifactId);
    return {
        status: "applied",
        migrated: input.decision.migrations.length,
        removed: input.decision.removals.length,
    };
}
//# sourceMappingURL=artifact-owner-consolidation.js.map