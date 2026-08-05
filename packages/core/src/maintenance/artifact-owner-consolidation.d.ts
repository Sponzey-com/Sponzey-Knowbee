export type NonCanonicalArtifactDisposition = {
    kind: "remove";
} | {
    kind: "migrate";
    targetArtifactId: string;
    migrationEvidenceRefs: string[];
} | {
    kind: "retain_with_expiry";
    owner: string;
    expiryCondition: string;
};
export interface ArtifactPurposeOwner {
    artifactId: string;
    canonical: boolean;
    activeConsumerIds: string[];
    disposition?: NonCanonicalArtifactDisposition;
}
export interface ArtifactOwnerMigration {
    artifactId: string;
    targetArtifactId: string;
    migrationEvidenceRefs: string[];
}
export interface ArtifactOwnerRetention {
    artifactId: string;
    owner: string;
    expiryCondition: string;
}
export interface ArtifactOwnerConsolidationDecision {
    status: "eligible";
    purposeId: string;
    snapshotVersion: string;
    canonicalArtifactId: string;
    removals: string[];
    migrations: ArtifactOwnerMigration[];
    retentions: ArtifactOwnerRetention[];
}
export declare function evaluateArtifactOwnerConsolidation(input: {
    purposeId: string;
    snapshotVersion: string;
    owners: ArtifactPurposeOwner[];
}): ArtifactOwnerConsolidationDecision;
export declare function applyArtifactOwnerConsolidation(input: {
    decision: ArtifactOwnerConsolidationDecision;
    migrate: (migration: ArtifactOwnerMigration) => Promise<void>;
    remove: (artifactId: string) => Promise<void>;
}): Promise<{
    status: "applied";
    migrated: number;
    removed: number;
}>;
//# sourceMappingURL=artifact-owner-consolidation.d.ts.map