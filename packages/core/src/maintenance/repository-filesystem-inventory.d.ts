import { type RepositoryArtifactDescriptor } from "./artifact-inventory.js";
export type RepositoryInventoryDiagnosticCode = "repository_root_unreadable" | "path_unreadable" | "symlink_skipped" | "artifact_unclassified";
export interface RepositoryInventoryDiagnostic {
    code: RepositoryInventoryDiagnosticCode;
    artifactId: string;
}
export interface RepositoryArtifactInventory {
    complete: boolean;
    artifacts: RepositoryArtifactDescriptor[];
    diagnostics: RepositoryInventoryDiagnostic[];
}
export declare function collectRepositoryArtifactInventory(input: {
    repositoryRoot: string;
}): RepositoryArtifactInventory;
//# sourceMappingURL=repository-filesystem-inventory.d.ts.map