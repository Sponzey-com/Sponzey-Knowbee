import { existsSync, realpathSync, rmSync, statSync } from "node:fs"
import { basename, extname, relative, resolve, sep } from "node:path"
import type { ChannelSource } from "../channels/contracts.js"
import type { RuntimePaths } from "../config/paths.js"
import { redactLogText } from "../logger/index.js"
import {
  insertArtifactMetadata,
  getArtifactMetadata,
  listActiveArtifactMetadata,
  listExpiredArtifactMetadata,
  markArtifactDeleted,
  type ArtifactMetadataInput,
  type DbArtifactMetadata,
} from "../db/index.js"
import {
  decideCleanupCandidate,
  type CleanupCandidateEvidence,
  type CleanupDecision,
} from "../maintenance/cleanup-decision.js"

export type ArtifactRetentionPolicy = "ephemeral" | "standard" | "permanent"
export type ArtifactDataClassification = "user" | "internal" | "audit"

export interface ArtifactStorageContext {
  readonly rootDir: string
  readonly fileSystem: ArtifactStorageFileSystem
}

export interface ArtifactStorageFileSystem {
  exists(path: string): boolean
  realpath(path: string): string
  remove(path: string): void
  stat(path: string): { isFile(): boolean; size: number }
}

const nodeArtifactStorageFileSystem: ArtifactStorageFileSystem = Object.freeze({
  exists: existsSync,
  realpath: realpathSync,
  remove: (path: string) => rmSync(path, { force: true }),
  stat: statSync,
})

export function createArtifactStorageContext(
  paths: Pick<RuntimePaths, "stateDir">,
  fileSystem: ArtifactStorageFileSystem = nodeArtifactStorageFileSystem,
): ArtifactStorageContext {
  return Object.freeze({ rootDir: resolve(paths.stateDir, "artifacts"), fileSystem })
}

export function createArtifactStorageContextFromRoot(
  rootDir: string,
  fileSystem: ArtifactStorageFileSystem = nodeArtifactStorageFileSystem,
): ArtifactStorageContext {
  return Object.freeze({ rootDir: resolve(rootDir), fileSystem })
}

function artifactLifecycleErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export interface ArtifactAccessDescriptor {
  ok: boolean
  filePath: string
  fileName: string
  mimeType: string
  sizeBytes?: number
  previewable: boolean
  downloadable: boolean
  url?: string
  previewUrl?: string
  downloadUrl?: string
  reason?: string
  userMessage?: string
}

export type ArtifactReferenceResolution =
  | {
      ok: true
      artifactRef: string
      filePath: string
      mimeType: string
      sizeBytes: number
    }
  | {
      ok: false
      artifactRef: string
      reason:
        | "invalid_ref"
        | "not_found"
        | "deleted"
        | "expired"
        | "scope_mismatch"
        | "outside_state_artifacts"
    }

export type ArtifactQuotaCleanupReason = "max_bytes" | "max_count"

export interface ArtifactQuotaCleanupCandidate {
  artifact: DbArtifactMetadata
  reasons: ArtifactQuotaCleanupReason[]
  sizeBytes: number
}

export interface ArtifactQuotaCleanupPlan {
  totalCount: number
  totalBytes: number
  retainedCount: number
  retainedBytes: number
  estimatedBytesToDelete: number
  candidates: ArtifactQuotaCleanupCandidate[]
}

export interface ArtifactQuotaCleanupFailure {
  artifactId: string
  filePath: string
  reason: "outside_state_artifacts" | "delete_failed"
  message: string
}

export interface ArtifactQuotaCleanupResult {
  plan: ArtifactQuotaCleanupPlan
  deleted: DbArtifactMetadata[]
  failures: ArtifactQuotaCleanupFailure[]
  retained: Array<{
    artifact: DbArtifactMetadata
    decision: Extract<CleanupDecision, { decision: "retain" }>
  }>
}

export type ArtifactCleanupEvidenceResolver = (
  artifact: DbArtifactMetadata,
) => Omit<CleanupCandidateEvidence, "candidateId" | "dataKind" | "retentionClass">

export interface ExternalArtifactImportPolicy {
  filePath: string
  allowedRoots: string[]
  maxBytes?: number
  allowedMimeTypes?: string[]
  mimeType?: string
}

export type ExternalArtifactImportValidation =
  | {
      ok: true
      filePath: string
      fileName: string
      mimeType: string
      sizeBytes: number
      previewable: boolean
    }
  | {
      ok: false
      filePath: string
      reason: "missing" | "not_file" | "outside_allowed_roots" | "too_large" | "mime_type_not_allowed"
      userMessage: string
      mimeType?: string
      sizeBytes?: number
    }

export const ARTIFACT_RETENTION_MS: Record<ArtifactRetentionPolicy, number | null> = {
  ephemeral: 24 * 60 * 60 * 1000,
  standard: 30 * 24 * 60 * 60 * 1000,
  permanent: null,
}

const PREVIEWABLE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
])

export const DEFAULT_CHANNEL_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024

export const CHANNEL_FILE_SIZE_LIMIT_BYTES: Partial<Record<ChannelSource, number>> = {
  webui: 100 * 1024 * 1024,
  telegram: 50 * 1024 * 1024,
  slack: 1024 * 1024 * 1024,
}

export function getChannelFileSizeLimitBytes(channel: ChannelSource): number {
  return CHANNEL_FILE_SIZE_LIMIT_BYTES[channel] ?? DEFAULT_CHANNEL_FILE_SIZE_LIMIT_BYTES
}

export const ARTIFACT_THUMBNAIL_POLICY: Partial<Record<ChannelSource, "not_generated">> = {
  webui: "not_generated",
  telegram: "not_generated",
  slack: "not_generated",
}

export const DEFAULT_ARTIFACT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000
export const DEFAULT_ARTIFACT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024
export const DEFAULT_ARTIFACT_STORAGE_QUOTA_COUNT = 50_000

let artifactCleanupTimer: ReturnType<typeof setInterval> | null = null

export function getArtifactsRoot(storage: ArtifactStorageContext): string {
  return storage.rootDir
}

export function isPathInside(parent: string, child: string): boolean {
  const root = resolve(parent)
  const candidate = resolve(child)
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

function resolveRealPathIfPresent(path: string, storage: ArtifactStorageContext): string {
  try {
    return storage.fileSystem.realpath(path)
  } catch {
    return resolve(path)
  }
}

export function isStateArtifactPath(filePath: string, storage: ArtifactStorageContext): boolean {
  const root = resolveRealPathIfPresent(getArtifactsRoot(storage), storage)
  const candidate = resolveRealPathIfPresent(filePath, storage)
  return isPathInside(root, candidate)
}

export function guessArtifactMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".gif":
      return "image/gif"
    case ".webp":
      return "image/webp"
    case ".bmp":
      return "image/bmp"
    case ".svg":
      return "image/svg+xml"
    case ".pdf":
      return "application/pdf"
    case ".txt":
    case ".log":
      return "text/plain"
    case ".md":
      return "text/markdown"
    case ".json":
      return "application/json"
    default:
      return "application/octet-stream"
  }
}

export function isPreviewableMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false
  return PREVIEWABLE_MIME_TYPES.has(normalizeMimeType(mimeType))
}

export function computeArtifactExpiresAt(
  policy: ArtifactRetentionPolicy = "standard",
  createdAt: number = Date.now(),
): number | null {
  const ttlMs = ARTIFACT_RETENTION_MS[policy]
  return ttlMs == null ? null : createdAt + ttlMs
}

export function buildArtifactApiUrls(
  filePath: string,
  storage: ArtifactStorageContext,
): { previewUrl: string; downloadUrl: string } | undefined {
  const root = getArtifactsRoot(storage)
  if (!isStateArtifactPath(filePath, storage)) return undefined
  const encodedPath = relative(root, resolve(filePath))
    .split(sep)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  if (!encodedPath) return undefined
  const previewUrl = `/api/artifacts/${encodedPath}`
  return {
    previewUrl,
    downloadUrl: `${previewUrl}?download=1`,
  }
}

export function buildArtifactAccessDescriptor(input: {
  filePath: string
  mimeType?: string
  sizeBytes?: number
  now?: number
  expiresAt?: number | null
  dataClassification?: ArtifactDataClassification
}, storage: ArtifactStorageContext): ArtifactAccessDescriptor {
  const filePath = resolve(input.filePath)
  const fileName = basename(filePath)
  const mimeType = input.mimeType ?? guessArtifactMimeType(filePath)
  const sizeBytes = input.sizeBytes ?? safeFileSize(filePath, storage)
  const urls = buildArtifactApiUrls(filePath, storage)
  if (!urls) {
    return {
      ok: false,
      filePath,
      fileName,
      mimeType,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      previewable: false,
      downloadable: false,
      reason: "outside_state_artifacts",
      userMessage: "이 파일은 안전한 artifact 저장소 밖에 있어 WebUI 링크로 노출하지 않습니다.",
    }
  }

  if (input.dataClassification === "internal" || input.dataClassification === "audit") {
    return {
      ok: false,
      filePath,
      fileName,
      mimeType,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      previewable: false,
      downloadable: false,
      reason: "restricted_data_classification",
      userMessage: "이 artifact는 일반 화면에서 열거나 다운로드할 수 없습니다.",
    }
  }

  const now = input.now ?? Date.now()
  if (input.expiresAt != null && input.expiresAt <= now) {
    return {
      ok: false,
      filePath,
      fileName,
      mimeType,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      previewable: false,
      downloadable: false,
      reason: "expired",
      userMessage: "이 파일은 보관 기간이 만료되어 다시 생성해야 합니다.",
    }
  }

  const previewable = isPreviewableMimeType(mimeType)
  return {
    ok: true,
    filePath,
    fileName,
    mimeType,
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    previewable,
    downloadable: true,
    url: previewable ? urls.previewUrl : urls.downloadUrl,
    previewUrl: urls.previewUrl,
    downloadUrl: urls.downloadUrl,
  }
}

export function resolveArtifactReference(input: {
  artifactRef: string
  runId?: string
  requestGroupId?: string
  now?: number
}, storage: ArtifactStorageContext): ArtifactReferenceResolution {
  const artifactRef = input.artifactRef.trim()
  const match = /^artifact:([0-9a-f-]{36})$/iu.exec(artifactRef)
  if (!match?.[1]) return { ok: false, artifactRef, reason: "invalid_ref" }
  const artifact = getArtifactMetadata(match[1])
  if (!artifact) return { ok: false, artifactRef, reason: "not_found" }
  if (artifact.deleted_at != null) return { ok: false, artifactRef, reason: "deleted" }
  if (artifact.expires_at != null && artifact.expires_at <= (input.now ?? Date.now())) {
    return { ok: false, artifactRef, reason: "expired" }
  }
  const scopeMatches =
    (input.runId != null && artifact.source_run_id === input.runId) ||
    (
      input.requestGroupId != null &&
      artifact.request_group_id === input.requestGroupId
    )
  if ((input.runId != null || input.requestGroupId != null) && !scopeMatches) {
    return { ok: false, artifactRef, reason: "scope_mismatch" }
  }
  if (!isStateArtifactPath(artifact.artifact_path, storage)) {
    return { ok: false, artifactRef, reason: "outside_state_artifacts" }
  }
  return {
    ok: true,
    artifactRef,
    filePath: artifact.artifact_path,
    mimeType: artifact.mime_type,
    sizeBytes: artifact.size_bytes ?? safeFileSize(artifact.artifact_path, storage) ?? 0,
  }
}

export function recordArtifactMetadata(input: ArtifactMetadataInput, storage: ArtifactStorageContext): string {
  const createdAt = input.createdAt ?? Date.now()
  const retentionPolicy = input.retentionPolicy ?? "standard"
  const filePath = resolve(input.artifactPath)
  const mimeType = input.mimeType ?? guessArtifactMimeType(filePath)
  const sizeBytes = input.sizeBytes ?? safeFileSize(filePath, storage)
  const expiresAt = input.expiresAt === undefined ? computeArtifactExpiresAt(retentionPolicy, createdAt) : input.expiresAt
  const descriptor = buildArtifactAccessDescriptor({
    filePath,
    mimeType,
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    expiresAt,
    now: createdAt,
    dataClassification: input.dataClassification ?? "user",
  }, storage)
  return insertArtifactMetadata({
    ...input,
    artifactPath: filePath,
    mimeType,
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    retentionPolicy,
    expiresAt,
    metadata: {
      ...(input.metadata ?? {}),
      dataClassification: input.dataClassification ?? "user",
      artifactLifecycle: {
        original: {
          path: filePath,
          mimeType,
          sizeBytes: sizeBytes ?? null,
        },
        preview: descriptor.ok && descriptor.previewable
          ? {
              path: filePath,
              url: descriptor.previewUrl ?? null,
              mimeType,
            }
          : null,
        thumbnail: null,
        delivery: {
          previewable: descriptor.previewable,
          downloadable: descriptor.downloadable,
          url: descriptor.url ?? null,
          previewUrl: descriptor.previewUrl ?? null,
          downloadUrl: descriptor.downloadUrl ?? null,
          fileName: descriptor.fileName,
        },
        retention: {
          policy: retentionPolicy,
          expiresAt,
        },
      },
    },
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
  })
}

export function resolveArtifactDataClassification(
  metadataJson: string | null | undefined,
): ArtifactDataClassification {
  if (!metadataJson) return "user"
  try {
    const parsed = JSON.parse(metadataJson) as { dataClassification?: unknown }
    return parsed.dataClassification === "internal" || parsed.dataClassification === "audit"
      ? parsed.dataClassification
      : "user"
  } catch {
    return "user"
  }
}

export function cleanupExpiredArtifacts(input: {
  now?: number
  deleteFiles?: boolean
  cleanupEvidence?: ArtifactCleanupEvidenceResolver
}, storage: ArtifactStorageContext): DbArtifactMetadata[] {
  const now = input.now ?? Date.now()
  const expired = listExpiredArtifactMetadata(now)
  const deleted: DbArtifactMetadata[] = []
  for (const artifact of expired) {
    const decision = artifactCleanupDecision(artifact, "expired", input.cleanupEvidence)
    if (decision.decision === "retain") continue
    if (input.deleteFiles !== false && artifact.artifact_path && isStateArtifactPath(artifact.artifact_path, storage)) {
      try {
        if (storage.fileSystem.exists(artifact.artifact_path)) {
          storage.fileSystem.remove(artifact.artifact_path)
        }
      } catch {
        // Cleanup is best-effort. Metadata still records expiry so the UI can report it.
      }
    }
    markArtifactDeleted(artifact.id, now)
    deleted.push(artifact)
  }
  return deleted
}

export function planArtifactQuotaCleanup(input: {
  maxBytes?: number
  maxCount?: number
  includePermanent?: boolean
}): ArtifactQuotaCleanupPlan {
  const artifacts = listActiveArtifactMetadata()
  const totalBytes = artifacts.reduce((sum, artifact) => sum + artifactSize(artifact), 0)
  let retainedBytes = totalBytes
  let retainedCount = artifacts.length
  const candidates: ArtifactQuotaCleanupCandidate[] = []

  if (input.maxBytes === undefined && input.maxCount === undefined) {
    return {
      totalCount: artifacts.length,
      totalBytes,
      retainedCount,
      retainedBytes,
      estimatedBytesToDelete: 0,
      candidates,
    }
  }

  for (const artifact of artifacts) {
    if (!input.includePermanent && artifact.retention_policy === "permanent") continue

    const reasons: ArtifactQuotaCleanupReason[] = []
    if (input.maxCount !== undefined && retainedCount > input.maxCount) reasons.push("max_count")
    if (input.maxBytes !== undefined && retainedBytes > input.maxBytes) reasons.push("max_bytes")
    if (reasons.length === 0) continue

    const sizeBytes = artifactSize(artifact)
    candidates.push({ artifact, reasons, sizeBytes })
    retainedCount = Math.max(0, retainedCount - 1)
    retainedBytes = Math.max(0, retainedBytes - sizeBytes)
  }

  return {
    totalCount: artifacts.length,
    totalBytes,
    retainedCount,
    retainedBytes,
    estimatedBytesToDelete: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
    candidates,
  }
}

export function cleanupArtifactStorageQuota(input: {
  maxBytes?: number
  maxCount?: number
  includePermanent?: boolean
  now?: number
  deleteFiles?: boolean
  cleanupEvidence?: ArtifactCleanupEvidenceResolver
}, storage: ArtifactStorageContext): ArtifactQuotaCleanupResult {
  const plan = planArtifactQuotaCleanup(input)
  const now = input.now ?? Date.now()
  const deleted: DbArtifactMetadata[] = []
  const failures: ArtifactQuotaCleanupFailure[] = []
  const retained: ArtifactQuotaCleanupResult["retained"] = []

  for (const candidate of plan.candidates) {
    const artifact = candidate.artifact
    const decision = artifactCleanupDecision(artifact, "quota_eligible", input.cleanupEvidence)
    if (decision.decision === "retain") {
      retained.push({ artifact, decision })
      continue
    }
    if (!isStateArtifactPath(artifact.artifact_path, storage)) {
      failures.push({
        artifactId: artifact.id,
        filePath: artifact.artifact_path,
        reason: "outside_state_artifacts",
        message: "Artifact metadata points outside the managed artifact storage.",
      })
      continue
    }

    if (input.deleteFiles !== false) {
      try {
        if (storage.fileSystem.exists(artifact.artifact_path)) {
          storage.fileSystem.remove(artifact.artifact_path)
        }
      } catch (error) {
        const message = artifactLifecycleErrorMessage(error)
        failures.push({
          artifactId: artifact.id,
          filePath: artifact.artifact_path,
          reason: "delete_failed",
          message,
        })
        continue
      }
    }

    markArtifactDeleted(artifact.id, now)
    deleted.push(artifact)
  }

  return { plan, deleted, failures, retained }
}

function artifactCleanupDecision(
  artifact: DbArtifactMetadata,
  eligibleRetentionClass: "expired" | "quota_eligible",
  resolveEvidence: ArtifactCleanupEvidenceResolver | undefined,
): CleanupDecision {
  return decideCleanupCandidate({
    candidateId: artifact.id,
    dataKind: "artifact",
    retentionClass: artifact.retention_policy === "permanent" ? "permanent" : eligibleRetentionClass,
    ...resolveEvidence?.(artifact),
  })
}

export function runArtifactCleanupCycle(input: {
  maxBytes?: number
  maxCount?: number
  includePermanent?: boolean
  now?: number
  deleteFiles?: boolean
  cleanupEvidence?: ArtifactCleanupEvidenceResolver
}, storage: ArtifactStorageContext): { expired: DbArtifactMetadata[]; quota: ArtifactQuotaCleanupResult } {
  const expired = cleanupExpiredArtifacts({
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.deleteFiles !== undefined ? { deleteFiles: input.deleteFiles } : {}),
    ...(input.cleanupEvidence !== undefined ? { cleanupEvidence: input.cleanupEvidence } : {}),
  }, storage)
  const quota = cleanupArtifactStorageQuota({
    maxBytes: input.maxBytes ?? DEFAULT_ARTIFACT_STORAGE_QUOTA_BYTES,
    maxCount: input.maxCount ?? DEFAULT_ARTIFACT_STORAGE_QUOTA_COUNT,
    ...(input.includePermanent !== undefined ? { includePermanent: input.includePermanent } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.deleteFiles !== undefined ? { deleteFiles: input.deleteFiles } : {}),
    ...(input.cleanupEvidence !== undefined ? { cleanupEvidence: input.cleanupEvidence } : {}),
  }, storage)
  return { expired, quota }
}

export function startArtifactCleanupScheduler(input: {
  intervalMs?: number
  maxBytes?: number
  maxCount?: number
  includePermanent?: boolean
  deleteFiles?: boolean
  cleanupEvidence?: ArtifactCleanupEvidenceResolver
}, storage: ArtifactStorageContext): void {
  if (artifactCleanupTimer) return
  const intervalMs = Math.max(1_000, input.intervalMs ?? DEFAULT_ARTIFACT_CLEANUP_INTERVAL_MS)
  artifactCleanupTimer = setInterval(() => {
    try {
      runArtifactCleanupCycle(input, storage)
    } catch {
      // Artifact cleanup is opportunistic and must not crash the daemon.
    }
  }, intervalMs)
  artifactCleanupTimer.unref?.()
}

export function stopArtifactCleanupScheduler(): void {
  if (!artifactCleanupTimer) return
  clearInterval(artifactCleanupTimer)
  artifactCleanupTimer = null
}

export function validateExternalArtifactImport(input: ExternalArtifactImportPolicy): ExternalArtifactImportValidation {
  const filePath = resolve(input.filePath)
  const mimeType = normalizeMimeType(input.mimeType ?? guessArtifactMimeType(filePath))
  const allowedRoots = input.allowedRoots.map((root) => resolve(root))

  if (!existsSync(filePath)) {
    return {
      ok: false,
      filePath,
      reason: "missing",
      userMessage: "가져올 파일을 찾을 수 없습니다.",
      mimeType,
    }
  }

  const stat = statSync(filePath)
  if (!stat.isFile()) {
    return {
      ok: false,
      filePath,
      reason: "not_file",
      userMessage: "가져올 대상이 일반 파일이 아닙니다.",
      mimeType,
    }
  }

  if (allowedRoots.length === 0 || !allowedRoots.some((root) => isPathInside(root, filePath))) {
    return {
      ok: false,
      filePath,
      reason: "outside_allowed_roots",
      userMessage: "허용된 경로 밖의 파일은 artifact로 가져올 수 없습니다.",
      mimeType,
      sizeBytes: stat.size,
    }
  }

  if (input.maxBytes !== undefined && stat.size > input.maxBytes) {
    return {
      ok: false,
      filePath,
      reason: "too_large",
      userMessage: "파일이 허용된 artifact 크기 제한을 초과했습니다.",
      mimeType,
      sizeBytes: stat.size,
    }
  }

  if (input.allowedMimeTypes && !isAllowedMimeType(mimeType, input.allowedMimeTypes)) {
    return {
      ok: false,
      filePath,
      reason: "mime_type_not_allowed",
      userMessage: "허용되지 않은 파일 형식입니다.",
      mimeType,
      sizeBytes: stat.size,
    }
  }

  return {
    ok: true,
    filePath,
    fileName: basename(filePath),
    mimeType,
    sizeBytes: stat.size,
    previewable: isPreviewableMimeType(mimeType),
  }
}

function safeFileSize(
  filePath: string,
  storage: ArtifactStorageContext,
): number | undefined {
  try {
    const stat = storage.fileSystem.stat(filePath)
    return stat.isFile() ? stat.size : undefined
  } catch {
    return undefined
  }
}

function artifactSize(artifact: DbArtifactMetadata): number {
  return artifact.size_bytes ?? 0
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream"
}

function isAllowedMimeType(mimeType: string, allowedMimeTypes: string[]): boolean {
  const normalized = normalizeMimeType(mimeType)
  return allowedMimeTypes.some((allowed) => {
    const normalizedAllowed = normalizeMimeType(allowed)
    if (normalizedAllowed.endsWith("/*")) {
      return normalized.startsWith(normalizedAllowed.slice(0, -1))
    }
    return normalized === normalizedAllowed
  })
}
