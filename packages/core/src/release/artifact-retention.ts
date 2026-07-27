import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import type { RuntimePaths } from "../config/paths.js"
import { LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY } from "./live-acceptance-signing-request-file-sink.js"

export const ARTIFACT_CLEANUP_CONFIRMATION = "CONFIRM ARTIFACT CLEANUP"

export interface ArtifactRetentionPolicy {
  readonly purpose: string
  readonly audience: "release_package" | "external_signer" | "audit_operator"
  readonly redaction: "sanitized" | "raw_by_design"
  readonly access: "admin_download_route" | "filesystem_private_file"
  readonly retention: "operator_cleanup"
  readonly rawDataAllowed: boolean
  readonly route: "admin_bundle_download" | "none"
}

export interface ArtifactCleanupTargetSummary {
  readonly kind: "admin_diagnostic_export" | "live_acceptance_signing_request" | "release_package_output"
  readonly directoryName: string
  readonly policy: ArtifactRetentionPolicy
  readonly scannedFiles: number
  readonly deleteEligibleFiles: number
  readonly skippedFiles: number
  readonly deletedFiles: number
  readonly verifiedDeletedFiles: number
  readonly failedDeleteFiles: number
  readonly reasonCounts: Record<string, number>
  readonly eligibleBytes: number
  readonly oldestEligibleAgeMs: number | null
}

export interface ArtifactCleanupPreview {
  readonly kind: "knowbee.artifact_cleanup.preview"
  readonly generatedAt: number
  readonly maxAgeMs: number
  readonly confirmation: typeof ARTIFACT_CLEANUP_CONFIRMATION
  readonly targets: ArtifactCleanupTargetSummary[]
}

export interface ArtifactCleanupExecution {
  readonly kind: "knowbee.artifact_cleanup.execution"
  readonly generatedAt: number
  readonly maxAgeMs: number
  readonly confirmed: boolean
  readonly targets: ArtifactCleanupTargetSummary[]
}

export interface ArtifactCleanupTargetUserProjection {
  readonly kind: ArtifactCleanupTargetSummary["kind"]
  readonly label: string
  readonly status: "empty" | "ready" | "cleaned" | "attention_required"
  readonly deletedLabel: string
  readonly verifiedLabel: string
  readonly skippedLabel: string
  readonly attentionLabel: string
  readonly deleteEligibleFiles: number
  readonly deletedFiles: number
  readonly verifiedDeletedFiles: number
  readonly skippedFiles: number
  readonly attentionCount: number
}

export interface ArtifactCleanupUserProjection {
  readonly kind: "knowbee.artifact_cleanup.user_projection"
  readonly generatedAt: number
  readonly confirmed: boolean | null
  readonly targets: ArtifactCleanupTargetUserProjection[]
}

export type ArtifactCleanupPaths = Pick<RuntimePaths, "stateDir">

const TARGET_LABELS: Record<ArtifactCleanupTargetSummary["kind"], string> = {
  admin_diagnostic_export: "진단 내보내기",
  live_acceptance_signing_request: "외부 서명 요청",
  release_package_output: "릴리스 출력",
}

const ADMIN_EXPORT_POLICY: ArtifactRetentionPolicy = Object.freeze({
  purpose: "sanitized_admin_diagnostic_download",
  audience: "release_package",
  redaction: "sanitized",
  access: "admin_download_route",
  retention: "operator_cleanup",
  rawDataAllowed: false,
  route: "admin_bundle_download",
})

const SIGNING_REQUEST_POLICY: ArtifactRetentionPolicy = Object.freeze({
  purpose: LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY.purpose,
  audience: LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY.audience,
  redaction: LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY.redaction,
  access: LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY.access,
  retention: LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY.retention,
  rawDataAllowed: LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY.rawDataAllowed,
  route: LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY.route,
})

const RELEASE_PACKAGE_OUTPUT_POLICY: ArtifactRetentionPolicy = Object.freeze({
  purpose: "explicit_release_package_output_cleanup",
  audience: "release_package",
  redaction: "sanitized",
  access: "filesystem_private_file",
  retention: "operator_cleanup",
  rawDataAllowed: false,
  route: "none",
})

function normalizeMaxAgeMs(value: number | undefined): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value
  return 24 * 60 * 60 * 1_000
}

function targetDirectory(paths: ArtifactCleanupPaths, directoryName: string): string {
  return resolve(paths.stateDir, ...directoryName.split("/"))
}

function releaseOutputDirectory(value: string | undefined): string | null {
  if (!value?.trim()) return null
  return resolve(value.trim())
}

function hasReleasePackageMarkers(directory: string): boolean {
  try {
    const manifest = lstatSync(join(directory, "manifest.json"))
    const checksums = lstatSync(join(directory, "SHA256SUMS"))
    return manifest.isFile() && !manifest.isSymbolicLink() && checksums.isFile() && !checksums.isSymbolicLink()
  } catch {
    return false
  }
}

function isInside(parent: string, child: string): boolean {
  const root = resolve(parent)
  const target = resolve(child)
  return target === root || target.startsWith(`${root}${sep}`)
}

function incrementReason(reasonCounts: Record<string, number>, reason: string, count = 1): void {
  reasonCounts[reason] = (reasonCounts[reason] ?? 0) + count
}

function mergeReasons(target: Record<string, number>, source: Record<string, number>): void {
  for (const [reason, count] of Object.entries(source)) incrementReason(target, reason, count)
}

function releasePackagePaths(directory: string): { paths: string[]; invalidCount: number } {
  try {
    const parsed = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as {
      artifacts?: Array<{ packagePath?: unknown; status?: unknown }>
    }
    const paths: string[] = []
    let invalidCount = 0
    for (const artifact of parsed.artifacts?.filter((item) => item.status === "present") ?? []) {
      const value = artifact.packagePath
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.startsWith("/") ||
        value.includes("..") ||
        value.split("/").some((part) => part === "" || part === "." || part === "..")
      ) {
        invalidCount += 1
        continue
      }
      paths.push(value)
    }
    return { paths: [...new Set(paths)], invalidCount }
  } catch {
    return { paths: [], invalidCount: 1 }
  }
}

function removeEmptyDirectory(path: string): boolean {
  try {
    if (readdirSync(path).length > 0) return false
    rmSync(path, { recursive: false, force: true })
    return true
  } catch {
    return false
  }
}

function scanReleasePayloadEntry(input: {
  readonly path: string
  readonly payloadDir: string
  readonly now: number
  readonly maxAgeMs: number
  readonly execute: boolean
}): Omit<ArtifactCleanupTargetSummary, "kind" | "directoryName" | "policy"> {
  let scannedFiles = 0
  let deleteEligibleFiles = 0
  let skippedFiles = 0
  let deletedFiles = 0
  let verifiedDeletedFiles = 0
  let failedDeleteFiles = 0
  const reasonCounts: Record<string, number> = {}
  let eligibleBytes = 0
  let oldestEligibleAgeMs: number | null = null

  if (!isInside(input.payloadDir, input.path) || !existsSync(input.path)) {
    if (!isInside(input.payloadDir, input.path)) incrementReason(reasonCounts, "outside_payload_root")
    return { scannedFiles, deleteEligibleFiles, skippedFiles, deletedFiles, verifiedDeletedFiles, failedDeleteFiles, reasonCounts, eligibleBytes, oldestEligibleAgeMs }
  }

  let stat
  try {
    stat = lstatSync(input.path)
  } catch {
    incrementReason(reasonCounts, "stat_failed")
    return { scannedFiles, deleteEligibleFiles, skippedFiles: 1, deletedFiles, verifiedDeletedFiles, failedDeleteFiles, reasonCounts, eligibleBytes, oldestEligibleAgeMs }
  }
  if (stat.isSymbolicLink()) {
    incrementReason(reasonCounts, "unsafe_symlink")
    return { scannedFiles, deleteEligibleFiles, skippedFiles: 1, deletedFiles, verifiedDeletedFiles, failedDeleteFiles, reasonCounts, eligibleBytes, oldestEligibleAgeMs }
  }
  if (stat.isFile()) {
    scannedFiles = 1
    const ageMs = Math.max(0, input.now - stat.mtimeMs)
    if (ageMs >= input.maxAgeMs) {
      deleteEligibleFiles = 1
      eligibleBytes = stat.size
      oldestEligibleAgeMs = ageMs
      if (input.execute) {
        try {
          rmSync(input.path, { force: true })
          deletedFiles = 1
          if (existsSync(input.path)) {
            failedDeleteFiles = 1
            incrementReason(reasonCounts, "post_delete_still_exists")
          }
          else verifiedDeletedFiles = 1
        } catch {
          skippedFiles = 1
          failedDeleteFiles = 1
          incrementReason(reasonCounts, "delete_exception")
        }
      }
    }
    return { scannedFiles, deleteEligibleFiles, skippedFiles, deletedFiles, verifiedDeletedFiles, failedDeleteFiles, reasonCounts, eligibleBytes, oldestEligibleAgeMs }
  }
  if (!stat.isDirectory()) {
    incrementReason(reasonCounts, "unsupported_file_type")
    return { scannedFiles, deleteEligibleFiles, skippedFiles: 1, deletedFiles, verifiedDeletedFiles, failedDeleteFiles, reasonCounts, eligibleBytes, oldestEligibleAgeMs }
  }

  let entries: string[]
  try {
    entries = readdirSync(input.path)
  } catch {
    incrementReason(reasonCounts, "read_directory_failed")
    return { scannedFiles, deleteEligibleFiles, skippedFiles: 1, deletedFiles, verifiedDeletedFiles, failedDeleteFiles, reasonCounts, eligibleBytes, oldestEligibleAgeMs }
  }
  for (const entry of entries) {
    const nested = scanReleasePayloadEntry({
      ...input,
      path: join(input.path, entry),
    })
    scannedFiles += nested.scannedFiles
    deleteEligibleFiles += nested.deleteEligibleFiles
    skippedFiles += nested.skippedFiles
    deletedFiles += nested.deletedFiles
    verifiedDeletedFiles += nested.verifiedDeletedFiles
    failedDeleteFiles += nested.failedDeleteFiles
    mergeReasons(reasonCounts, nested.reasonCounts)
    eligibleBytes += nested.eligibleBytes
    if (nested.oldestEligibleAgeMs !== null) {
      oldestEligibleAgeMs = oldestEligibleAgeMs === null
        ? nested.oldestEligibleAgeMs
        : Math.max(oldestEligibleAgeMs, nested.oldestEligibleAgeMs)
    }
  }
  if (input.execute && input.path !== input.payloadDir) removeEmptyDirectory(input.path)
  return { scannedFiles, deleteEligibleFiles, skippedFiles, deletedFiles, verifiedDeletedFiles, failedDeleteFiles, reasonCounts, eligibleBytes, oldestEligibleAgeMs }
}

function scanReleasePayload(input: {
  readonly directory: string
  readonly now: number
  readonly maxAgeMs: number
  readonly execute: boolean
}): Omit<ArtifactCleanupTargetSummary, "kind" | "directoryName" | "policy"> {
  const payloadDir = join(input.directory, "payload")
  let scannedFiles = 0
  let deleteEligibleFiles = 0
  let skippedFiles = 0
  let deletedFiles = 0
  let verifiedDeletedFiles = 0
  let failedDeleteFiles = 0
  const reasonCounts: Record<string, number> = {}
  let eligibleBytes = 0
  let oldestEligibleAgeMs: number | null = null
  const packagePaths = releasePackagePaths(input.directory)
  if (packagePaths.invalidCount > 0) incrementReason(reasonCounts, "package_path_invalid", packagePaths.invalidCount)
  for (const packagePath of packagePaths.paths) {
    const nested = scanReleasePayloadEntry({
      path: join(payloadDir, ...packagePath.split("/")),
      payloadDir,
      now: input.now,
      maxAgeMs: input.maxAgeMs,
      execute: input.execute,
    })
    scannedFiles += nested.scannedFiles
    deleteEligibleFiles += nested.deleteEligibleFiles
    skippedFiles += nested.skippedFiles
    deletedFiles += nested.deletedFiles
    verifiedDeletedFiles += nested.verifiedDeletedFiles
    failedDeleteFiles += nested.failedDeleteFiles
    mergeReasons(reasonCounts, nested.reasonCounts)
    eligibleBytes += nested.eligibleBytes
    if (nested.oldestEligibleAgeMs !== null) {
      oldestEligibleAgeMs = oldestEligibleAgeMs === null
        ? nested.oldestEligibleAgeMs
        : Math.max(oldestEligibleAgeMs, nested.oldestEligibleAgeMs)
    }
  }
  return { scannedFiles, deleteEligibleFiles, skippedFiles, deletedFiles, verifiedDeletedFiles, failedDeleteFiles, reasonCounts, eligibleBytes, oldestEligibleAgeMs }
}

function summarizeTarget(input: {
  readonly paths: ArtifactCleanupPaths
  readonly kind: ArtifactCleanupTargetSummary["kind"]
  readonly directoryName: string
  readonly directoryPath?: string
  readonly policy: ArtifactRetentionPolicy
  readonly now: number
  readonly maxAgeMs: number
  readonly execute: boolean
  readonly requireReleaseMarkers?: boolean
}): ArtifactCleanupTargetSummary {
  const directory = input.directoryPath ?? targetDirectory(input.paths, input.directoryName)
  let scannedFiles = 0
  let deleteEligibleFiles = 0
  let skippedFiles = 0
  let deletedFiles = 0
  let verifiedDeletedFiles = 0
  let failedDeleteFiles = 0
  const reasonCounts: Record<string, number> = {}
  let eligibleBytes = 0
  let oldestEligibleAgeMs: number | null = null

  if (!existsSync(directory) || (input.requireReleaseMarkers === true && !hasReleasePackageMarkers(directory))) {
    if (input.requireReleaseMarkers === true) incrementReason(reasonCounts, "manifest_marker_missing")
    return {
      kind: input.kind,
      directoryName: input.directoryName,
      policy: input.policy,
      scannedFiles,
      deleteEligibleFiles,
      skippedFiles,
      deletedFiles,
      verifiedDeletedFiles,
      failedDeleteFiles,
      reasonCounts,
      eligibleBytes,
      oldestEligibleAgeMs,
    }
  }

  if (input.requireReleaseMarkers === true) {
    const payload = scanReleasePayload({
      directory,
      now: input.now,
      maxAgeMs: input.maxAgeMs,
      execute: input.execute,
    })
    scannedFiles += payload.scannedFiles
    deleteEligibleFiles += payload.deleteEligibleFiles
    skippedFiles += payload.skippedFiles
    deletedFiles += payload.deletedFiles
    verifiedDeletedFiles += payload.verifiedDeletedFiles
    failedDeleteFiles += payload.failedDeleteFiles
    mergeReasons(reasonCounts, payload.reasonCounts)
    eligibleBytes += payload.eligibleBytes
    if (payload.oldestEligibleAgeMs !== null) {
      oldestEligibleAgeMs = oldestEligibleAgeMs === null
        ? payload.oldestEligibleAgeMs
        : Math.max(oldestEligibleAgeMs, payload.oldestEligibleAgeMs)
    }
  }

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    let stat
    try {
      stat = lstatSync(path)
    } catch {
      skippedFiles += 1
      incrementReason(reasonCounts, "stat_failed")
      continue
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      skippedFiles += 1
      incrementReason(reasonCounts, stat.isSymbolicLink() ? "unsafe_symlink" : "skipped_directory")
      continue
    }
    scannedFiles += 1
    const ageMs = Math.max(0, input.now - stat.mtimeMs)
    if (ageMs < input.maxAgeMs) continue
    deleteEligibleFiles += 1
    eligibleBytes += stat.size
    oldestEligibleAgeMs = oldestEligibleAgeMs === null ? ageMs : Math.max(oldestEligibleAgeMs, ageMs)
    if (input.execute) {
      try {
        rmSync(path, { force: true })
        deletedFiles += 1
        if (existsSync(path)) {
          failedDeleteFiles += 1
          incrementReason(reasonCounts, "post_delete_still_exists")
        }
        else verifiedDeletedFiles += 1
      } catch {
        skippedFiles += 1
        failedDeleteFiles += 1
        incrementReason(reasonCounts, "delete_exception")
      }
    }
  }

  return {
    kind: input.kind,
    directoryName: input.directoryName,
    policy: input.policy,
    scannedFiles,
    deleteEligibleFiles,
    skippedFiles,
    deletedFiles,
    verifiedDeletedFiles,
    failedDeleteFiles,
    reasonCounts,
    eligibleBytes,
    oldestEligibleAgeMs,
  }
}

function buildTargets(input: {
  readonly paths: ArtifactCleanupPaths
  readonly now: number
  readonly maxAgeMs: number
  readonly execute: boolean
  readonly releaseOutputDir?: string
}): ArtifactCleanupTargetSummary[] {
  const targets = [
    summarizeTarget({
      ...input,
      kind: "admin_diagnostic_export",
      directoryName: "admin-exports",
      policy: ADMIN_EXPORT_POLICY,
    }),
    summarizeTarget({
      ...input,
      kind: "live_acceptance_signing_request",
      directoryName: LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY.directoryName,
      policy: SIGNING_REQUEST_POLICY,
    }),
  ]
  const explicitReleaseOutput = releaseOutputDirectory(input.releaseOutputDir)
  if (explicitReleaseOutput) {
    targets.push(summarizeTarget({
      ...input,
      kind: "release_package_output",
      directoryName: "explicit-release-output",
      directoryPath: explicitReleaseOutput,
      policy: RELEASE_PACKAGE_OUTPUT_POLICY,
      requireReleaseMarkers: true,
    }))
  }
  return targets
}

export function previewArtifactCleanup(input: {
  readonly paths: ArtifactCleanupPaths
  readonly now?: number
  readonly maxAgeMs?: number
  readonly releaseOutputDir?: string
}): ArtifactCleanupPreview {
  const now = input.now ?? Date.now()
  const maxAgeMs = normalizeMaxAgeMs(input.maxAgeMs)
  const releaseOutputDir = releaseOutputDirectory(input.releaseOutputDir)
  return {
    kind: "knowbee.artifact_cleanup.preview",
    generatedAt: now,
    maxAgeMs,
    confirmation: ARTIFACT_CLEANUP_CONFIRMATION,
    targets: buildTargets({
      paths: input.paths,
      now,
      maxAgeMs,
      execute: false,
      ...(releaseOutputDir ? { releaseOutputDir } : {}),
    }),
  }
}

export function executeArtifactCleanup(input: {
  readonly paths: ArtifactCleanupPaths
  readonly confirmation: string
  readonly now?: number
  readonly maxAgeMs?: number
  readonly releaseOutputDir?: string
}): ArtifactCleanupExecution {
  const now = input.now ?? Date.now()
  const maxAgeMs = normalizeMaxAgeMs(input.maxAgeMs)
  const confirmed = input.confirmation === ARTIFACT_CLEANUP_CONFIRMATION
  const releaseOutputDir = releaseOutputDirectory(input.releaseOutputDir)
  return {
    kind: "knowbee.artifact_cleanup.execution",
    generatedAt: now,
    maxAgeMs,
    confirmed,
    targets: confirmed ? buildTargets({
      paths: input.paths,
      now,
      maxAgeMs,
      execute: true,
      ...(releaseOutputDir ? { releaseOutputDir } : {}),
    }) : [],
  }
}

function projectTargetStatus(target: ArtifactCleanupTargetSummary, confirmed: boolean | null): ArtifactCleanupTargetUserProjection["status"] {
  if (target.failedDeleteFiles > 0) return "attention_required"
  if (confirmed === true && target.verifiedDeletedFiles > 0) return "cleaned"
  if (target.deleteEligibleFiles > 0) return "ready"
  return "empty"
}

export function projectArtifactCleanupForUser(
  input: ArtifactCleanupPreview | ArtifactCleanupExecution,
): ArtifactCleanupUserProjection {
  const confirmed = input.kind === "knowbee.artifact_cleanup.execution" ? input.confirmed : null
  return {
    kind: "knowbee.artifact_cleanup.user_projection",
    generatedAt: input.generatedAt,
    confirmed,
    targets: input.targets.map((target) => {
      const attentionCount = target.failedDeleteFiles
      return {
        kind: target.kind,
        label: TARGET_LABELS[target.kind],
        status: projectTargetStatus(target, confirmed),
        deletedLabel: `삭제됨 ${target.deletedFiles}`,
        verifiedLabel: `확인됨 ${target.verifiedDeletedFiles}`,
        skippedLabel: `건너뜀 ${target.skippedFiles}`,
        attentionLabel: `확인 필요 ${attentionCount}`,
        deleteEligibleFiles: target.deleteEligibleFiles,
        deletedFiles: target.deletedFiles,
        verifiedDeletedFiles: target.verifiedDeletedFiles,
        skippedFiles: target.skippedFiles,
        attentionCount,
      }
    }),
  }
}
