import type { ChannelSource } from "../channels/contracts.js";
import type { RuntimePaths } from "../config/paths.js";
import { type ArtifactMetadataInput, type DbArtifactMetadata } from "../db/index.js";
import { type CleanupCandidateEvidence, type CleanupDecision } from "../maintenance/cleanup-decision.js";
export type ArtifactRetentionPolicy = "ephemeral" | "standard" | "permanent";
export type ArtifactDataClassification = "user" | "internal" | "audit";
export interface ArtifactStorageContext {
    readonly rootDir: string;
    readonly fileSystem: ArtifactStorageFileSystem;
}
export interface ArtifactStorageFileSystem {
    exists(path: string): boolean;
    realpath(path: string): string;
    remove(path: string): void;
    stat(path: string): {
        isFile(): boolean;
        size: number;
    };
}
export declare function createArtifactStorageContext(paths: Pick<RuntimePaths, "stateDir">, fileSystem?: ArtifactStorageFileSystem): ArtifactStorageContext;
export declare function createArtifactStorageContextFromRoot(rootDir: string, fileSystem?: ArtifactStorageFileSystem): ArtifactStorageContext;
export interface ArtifactAccessDescriptor {
    ok: boolean;
    filePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes?: number;
    previewable: boolean;
    downloadable: boolean;
    url?: string;
    previewUrl?: string;
    downloadUrl?: string;
    reason?: string;
    userMessage?: string;
}
export type ArtifactReferenceResolution = {
    ok: true;
    artifactRef: string;
    filePath: string;
    mimeType: string;
    sizeBytes: number;
} | {
    ok: false;
    artifactRef: string;
    reason: "invalid_ref" | "not_found" | "deleted" | "expired" | "scope_mismatch" | "outside_state_artifacts";
};
export type ArtifactQuotaCleanupReason = "max_bytes" | "max_count";
export interface ArtifactQuotaCleanupCandidate {
    artifact: DbArtifactMetadata;
    reasons: ArtifactQuotaCleanupReason[];
    sizeBytes: number;
}
export interface ArtifactQuotaCleanupPlan {
    totalCount: number;
    totalBytes: number;
    retainedCount: number;
    retainedBytes: number;
    estimatedBytesToDelete: number;
    candidates: ArtifactQuotaCleanupCandidate[];
}
export interface ArtifactQuotaCleanupFailure {
    artifactId: string;
    filePath: string;
    reason: "outside_state_artifacts" | "delete_failed";
    message: string;
}
export interface ArtifactQuotaCleanupResult {
    plan: ArtifactQuotaCleanupPlan;
    deleted: DbArtifactMetadata[];
    failures: ArtifactQuotaCleanupFailure[];
    retained: Array<{
        artifact: DbArtifactMetadata;
        decision: Extract<CleanupDecision, {
            decision: "retain";
        }>;
    }>;
}
export type ArtifactCleanupEvidenceResolver = (artifact: DbArtifactMetadata) => Omit<CleanupCandidateEvidence, "candidateId" | "dataKind" | "retentionClass">;
export interface ExternalArtifactImportPolicy {
    filePath: string;
    allowedRoots: string[];
    maxBytes?: number;
    allowedMimeTypes?: string[];
    mimeType?: string;
}
export type ExternalArtifactImportValidation = {
    ok: true;
    filePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    previewable: boolean;
} | {
    ok: false;
    filePath: string;
    reason: "missing" | "not_file" | "outside_allowed_roots" | "too_large" | "mime_type_not_allowed";
    userMessage: string;
    mimeType?: string;
    sizeBytes?: number;
};
export declare const ARTIFACT_RETENTION_MS: Record<ArtifactRetentionPolicy, number | null>;
export declare const DEFAULT_CHANNEL_FILE_SIZE_LIMIT_BYTES: number;
export declare const CHANNEL_FILE_SIZE_LIMIT_BYTES: Partial<Record<ChannelSource, number>>;
export declare function getChannelFileSizeLimitBytes(channel: ChannelSource): number;
export declare const ARTIFACT_THUMBNAIL_POLICY: Partial<Record<ChannelSource, "not_generated">>;
export declare const DEFAULT_ARTIFACT_CLEANUP_INTERVAL_MS: number;
export declare const DEFAULT_ARTIFACT_STORAGE_QUOTA_BYTES: number;
export declare const DEFAULT_ARTIFACT_STORAGE_QUOTA_COUNT = 50000;
export declare function getArtifactsRoot(storage: ArtifactStorageContext): string;
export declare function isPathInside(parent: string, child: string): boolean;
export declare function isStateArtifactPath(filePath: string, storage: ArtifactStorageContext): boolean;
export declare function guessArtifactMimeType(filePath: string): string;
export declare function isPreviewableMimeType(mimeType: string | undefined): boolean;
export declare function computeArtifactExpiresAt(policy?: ArtifactRetentionPolicy, createdAt?: number): number | null;
export declare function buildArtifactApiUrls(filePath: string, storage: ArtifactStorageContext): {
    previewUrl: string;
    downloadUrl: string;
} | undefined;
export declare function buildArtifactAccessDescriptor(input: {
    filePath: string;
    mimeType?: string;
    sizeBytes?: number;
    now?: number;
    expiresAt?: number | null;
    dataClassification?: ArtifactDataClassification;
}, storage: ArtifactStorageContext): ArtifactAccessDescriptor;
export declare function resolveArtifactReference(input: {
    artifactRef: string;
    runId?: string;
    requestGroupId?: string;
    now?: number;
}, storage: ArtifactStorageContext): ArtifactReferenceResolution;
export declare function recordArtifactMetadata(input: ArtifactMetadataInput, storage: ArtifactStorageContext): string;
export declare function resolveArtifactDataClassification(metadataJson: string | null | undefined): ArtifactDataClassification;
export declare function cleanupExpiredArtifacts(input: {
    now?: number;
    deleteFiles?: boolean;
    cleanupEvidence?: ArtifactCleanupEvidenceResolver;
}, storage: ArtifactStorageContext): DbArtifactMetadata[];
export declare function planArtifactQuotaCleanup(input: {
    maxBytes?: number;
    maxCount?: number;
    includePermanent?: boolean;
}): ArtifactQuotaCleanupPlan;
export declare function cleanupArtifactStorageQuota(input: {
    maxBytes?: number;
    maxCount?: number;
    includePermanent?: boolean;
    now?: number;
    deleteFiles?: boolean;
    cleanupEvidence?: ArtifactCleanupEvidenceResolver;
}, storage: ArtifactStorageContext): ArtifactQuotaCleanupResult;
export declare function runArtifactCleanupCycle(input: {
    maxBytes?: number;
    maxCount?: number;
    includePermanent?: boolean;
    now?: number;
    deleteFiles?: boolean;
    cleanupEvidence?: ArtifactCleanupEvidenceResolver;
}, storage: ArtifactStorageContext): {
    expired: DbArtifactMetadata[];
    quota: ArtifactQuotaCleanupResult;
};
export declare function startArtifactCleanupScheduler(input: {
    intervalMs?: number;
    maxBytes?: number;
    maxCount?: number;
    includePermanent?: boolean;
    deleteFiles?: boolean;
    cleanupEvidence?: ArtifactCleanupEvidenceResolver;
}, storage: ArtifactStorageContext): void;
export declare function stopArtifactCleanupScheduler(): void;
export declare function validateExternalArtifactImport(input: ExternalArtifactImportPolicy): ExternalArtifactImportValidation;
//# sourceMappingURL=lifecycle.d.ts.map