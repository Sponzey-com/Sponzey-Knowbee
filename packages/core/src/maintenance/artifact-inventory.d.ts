export type RepositoryArtifactKind = "source" | "prompt" | "data" | "configuration" | "document" | "test_fixture" | "generated_output" | "temporary" | "backup" | "ui_asset";
export type ArtifactReferenceBoundary = "runtime" | "test" | "registry" | "migration" | "deployment" | "build" | "retention" | "ui";
export interface ArtifactReference {
    owner: string;
    detail: string;
}
export interface ArtifactReferenceScan {
    complete: boolean;
    references: ArtifactReference[];
}
export interface RepositoryArtifactEvidence {
    artifactId: string;
    kind: RepositoryArtifactKind;
    referenceScans: Record<ArtifactReferenceBoundary, ArtifactReferenceScan>;
    generatedFrom: string | null;
    retentionReasons: string[];
}
export type RepositoryArtifactDescriptor = Pick<RepositoryArtifactEvidence, "artifactId" | "kind" | "generatedFrom" | "retentionReasons">;
export type ArtifactReferenceAdapter = (artifact: RepositoryArtifactDescriptor) => Promise<ArtifactReference[]>;
export type ArtifactReferenceAdapters = Record<ArtifactReferenceBoundary, ArtifactReferenceAdapter>;
export type RepositoryArtifactStatus = "referenced" | "generated" | "retained" | "candidate" | "unknown";
export interface ClassifiedArtifactReference extends ArtifactReference {
    boundary: ArtifactReferenceBoundary;
}
export interface RepositoryArtifactClassification {
    artifactId: string;
    kind: RepositoryArtifactKind;
    status: RepositoryArtifactStatus;
    reasonCodes: string[];
    references: ClassifiedArtifactReference[];
}
export declare function describeRepositoryArtifact(rawArtifactId: string): RepositoryArtifactDescriptor | undefined;
export declare function classifyRepositoryArtifact(evidence: RepositoryArtifactEvidence): RepositoryArtifactClassification;
export declare function inspectRepositoryArtifact(input: {
    artifact: RepositoryArtifactDescriptor;
    adapters: ArtifactReferenceAdapters;
}): Promise<RepositoryArtifactClassification>;
//# sourceMappingURL=artifact-inventory.d.ts.map