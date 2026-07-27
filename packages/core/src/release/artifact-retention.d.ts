import type { RuntimePaths } from "../config/paths.js";
export declare const ARTIFACT_CLEANUP_CONFIRMATION = "CONFIRM ARTIFACT CLEANUP";
export interface ArtifactRetentionPolicy {
    readonly purpose: string;
    readonly audience: "release_package" | "external_signer" | "audit_operator";
    readonly redaction: "sanitized" | "raw_by_design";
    readonly access: "admin_download_route" | "filesystem_private_file";
    readonly retention: "operator_cleanup";
    readonly rawDataAllowed: boolean;
    readonly route: "admin_bundle_download" | "none";
}
export interface ArtifactCleanupTargetSummary {
    readonly kind: "admin_diagnostic_export" | "live_acceptance_signing_request" | "release_package_output";
    readonly directoryName: string;
    readonly policy: ArtifactRetentionPolicy;
    readonly scannedFiles: number;
    readonly deleteEligibleFiles: number;
    readonly skippedFiles: number;
    readonly deletedFiles: number;
    readonly verifiedDeletedFiles: number;
    readonly failedDeleteFiles: number;
    readonly reasonCounts: Record<string, number>;
    readonly eligibleBytes: number;
    readonly oldestEligibleAgeMs: number | null;
}
export interface ArtifactCleanupPreview {
    readonly kind: "knowbee.artifact_cleanup.preview";
    readonly generatedAt: number;
    readonly maxAgeMs: number;
    readonly confirmation: typeof ARTIFACT_CLEANUP_CONFIRMATION;
    readonly targets: ArtifactCleanupTargetSummary[];
}
export interface ArtifactCleanupExecution {
    readonly kind: "knowbee.artifact_cleanup.execution";
    readonly generatedAt: number;
    readonly maxAgeMs: number;
    readonly confirmed: boolean;
    readonly targets: ArtifactCleanupTargetSummary[];
}
export interface ArtifactCleanupTargetUserProjection {
    readonly kind: ArtifactCleanupTargetSummary["kind"];
    readonly label: string;
    readonly status: "empty" | "ready" | "cleaned" | "attention_required";
    readonly deletedLabel: string;
    readonly verifiedLabel: string;
    readonly skippedLabel: string;
    readonly attentionLabel: string;
    readonly deleteEligibleFiles: number;
    readonly deletedFiles: number;
    readonly verifiedDeletedFiles: number;
    readonly skippedFiles: number;
    readonly attentionCount: number;
}
export interface ArtifactCleanupUserProjection {
    readonly kind: "knowbee.artifact_cleanup.user_projection";
    readonly generatedAt: number;
    readonly confirmed: boolean | null;
    readonly targets: ArtifactCleanupTargetUserProjection[];
}
export type ArtifactCleanupPaths = Pick<RuntimePaths, "stateDir">;
export declare function previewArtifactCleanup(input: {
    readonly paths: ArtifactCleanupPaths;
    readonly now?: number;
    readonly maxAgeMs?: number;
    readonly releaseOutputDir?: string;
}): ArtifactCleanupPreview;
export declare function executeArtifactCleanup(input: {
    readonly paths: ArtifactCleanupPaths;
    readonly confirmation: string;
    readonly now?: number;
    readonly maxAgeMs?: number;
    readonly releaseOutputDir?: string;
}): ArtifactCleanupExecution;
export declare function projectArtifactCleanupForUser(input: ArtifactCleanupPreview | ArtifactCleanupExecution): ArtifactCleanupUserProjection;
//# sourceMappingURL=artifact-retention.d.ts.map