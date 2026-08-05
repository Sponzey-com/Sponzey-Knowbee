import type { ArtifactReference, ArtifactReferenceAdapters, ArtifactReferenceBoundary } from "./artifact-inventory.js";
export type RepositoryReferenceScanStatus = "complete" | "incomplete";
export interface RepositoryReferenceRecord extends ArtifactReference {
    boundary: ArtifactReferenceBoundary;
    targetArtifactId: string;
}
export interface RepositoryReferenceIndex {
    readonly scanStatus: Readonly<Record<ArtifactReferenceBoundary, RepositoryReferenceScanStatus>>;
    readonly records: readonly RepositoryReferenceRecord[];
}
export declare function buildRepositoryReferenceIndex(input: {
    records: RepositoryReferenceRecord[];
    scanStatus: Record<ArtifactReferenceBoundary, RepositoryReferenceScanStatus>;
}): RepositoryReferenceIndex;
export declare function createIndexedReferenceAdapters(index: RepositoryReferenceIndex): ArtifactReferenceAdapters;
//# sourceMappingURL=repository-reference-index.d.ts.map