import type {
  BackupSnapshotManifest,
  RestoreRehearsalCheckName,
  RestoreRehearsalReport,
  SnapshotVerificationResult,
} from "../config/backup-rehearsal.js"

export const REQUIRED_RESTORE_REHEARSAL_CHECKS: readonly RestoreRehearsalCheckName[] = [
  "manifest_checksum",
  "file_copy",
  "sqlite_integrity",
  "migration_status",
  "prompt_source_registry",
]

export interface BackupRestoreRehearsalReceipt {
  kind: "knowbee.release.backup_restore_rehearsal_receipt"
  schemaVersion: 1
  status: "passed"
  issuedAt: number
  snapshot: {
    id: string
    checksum: string
    appVersion: string
    gitTag: string | null
    gitCommit: string | null
    schemaVersion: number
    latestSchemaVersion: number
  }
  restore: {
    checkCount: 5
    checks: readonly RestoreRehearsalCheckName[]
    restoredFileCount: number
    promptSourceCount: number
    migration: {
      currentVersion: number
      latestVersion: number
      upToDate: true
    }
  }
}

export type BackupRestoreReceiptBuildResult =
  | { status: "ready"; receipt: Readonly<BackupRestoreRehearsalReceipt> }
  | { status: "rejected"; reasonCode: string }

export type BackupRestoreReceiptVerificationResult =
  | { status: "verified" }
  | { status: "rejected"; reasonCode: string }

const SHA256_PATTERN = /^[a-f0-9]{64}$/

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validSnapshotIdentity(manifest: unknown): manifest is BackupSnapshotManifest {
  if (!objectRecord(manifest)) return false
  return (
    manifest.kind === "knowbee.backup.snapshot" &&
    manifest.version === 1 &&
    typeof manifest.id === "string" &&
    manifest.id.trim().length > 0 &&
    typeof manifest.checksum === "string" &&
    SHA256_PATTERN.test(manifest.checksum) &&
    typeof manifest.appVersion === "string" &&
    manifest.appVersion.trim().length > 0 &&
    Number.isSafeInteger(manifest.schemaVersion) &&
    Number(manifest.schemaVersion) >= 0 &&
    Number.isSafeInteger(manifest.latestSchemaVersion) &&
    Number(manifest.latestSchemaVersion) >= Number(manifest.schemaVersion) &&
    Array.isArray(manifest.files)
  )
}

function checkNames(value: unknown): value is RestoreRehearsalCheckName[] {
  return (
    Array.isArray(value) &&
    value.length === REQUIRED_RESTORE_REHEARSAL_CHECKS.length &&
    value.every(
      (item, index) =>
        typeof item === "string" && item === REQUIRED_RESTORE_REHEARSAL_CHECKS[index],
    )
  )
}

export function buildBackupRestoreRehearsalReceipt(input: {
  manifest: Readonly<BackupSnapshotManifest>
  snapshotVerification: Readonly<SnapshotVerificationResult>
  report: Readonly<RestoreRehearsalReport>
  issuedAt: number
}): BackupRestoreReceiptBuildResult {
  if (!validSnapshotIdentity(input.manifest)) {
    return { status: "rejected", reasonCode: "backup_snapshot_identity_invalid" }
  }
  if (!input.snapshotVerification.ok || input.snapshotVerification.failures.length > 0) {
    return { status: "rejected", reasonCode: "snapshot_checksum_failed" }
  }
  if (input.report.snapshotId !== input.manifest.id) {
    return { status: "rejected", reasonCode: "restore_snapshot_binding_mismatch" }
  }
  const seen = new Set<RestoreRehearsalCheckName>()
  for (const check of input.report.checks) {
    if (!REQUIRED_RESTORE_REHEARSAL_CHECKS.includes(check.name)) {
      return { status: "rejected", reasonCode: `restore_check_extra:${check.name}` }
    }
    if (seen.has(check.name)) {
      return { status: "rejected", reasonCode: `restore_check_duplicate:${check.name}` }
    }
    seen.add(check.name)
  }
  for (const name of REQUIRED_RESTORE_REHEARSAL_CHECKS) {
    const check = input.report.checks.find((candidate) => candidate.name === name)
    if (!check) return { status: "rejected", reasonCode: `restore_check_missing:${name}` }
    if (!check.ok) return { status: "rejected", reasonCode: `restore_check_failed:${name}` }
  }
  if (!input.report.ok) return { status: "rejected", reasonCode: "restore_report_failed" }
  const migration = input.report.migrationStatus
  if (
    !migration?.upToDate ||
    migration.pendingVersions.length > 0 ||
    migration.unknownAppliedVersions.length > 0 ||
    migration.currentVersion !== input.manifest.schemaVersion ||
    migration.latestVersion !== input.manifest.latestSchemaVersion
  ) {
    return { status: "rejected", reasonCode: "restore_migration_not_current" }
  }
  if (input.report.restoredFiles.length !== input.manifest.files.length) {
    return { status: "rejected", reasonCode: "restore_file_count_mismatch" }
  }
  if (!Number.isSafeInteger(input.report.promptSourceCount) || input.report.promptSourceCount < 1) {
    return { status: "rejected", reasonCode: "restore_prompt_sources_missing" }
  }
  if (!Number.isSafeInteger(input.issuedAt) || input.issuedAt < 0) {
    return { status: "rejected", reasonCode: "backup_restore_receipt_issued_at_invalid" }
  }
  const receipt: Readonly<BackupRestoreRehearsalReceipt> = Object.freeze({
    kind: "knowbee.release.backup_restore_rehearsal_receipt",
    schemaVersion: 1,
    status: "passed",
    issuedAt: input.issuedAt,
    snapshot: Object.freeze({
      id: input.manifest.id,
      checksum: input.manifest.checksum,
      appVersion: input.manifest.appVersion,
      gitTag: input.manifest.gitTag ?? null,
      gitCommit: input.manifest.gitCommit ?? null,
      schemaVersion: input.manifest.schemaVersion,
      latestSchemaVersion: input.manifest.latestSchemaVersion,
    }),
    restore: Object.freeze({
      checkCount: 5,
      checks: Object.freeze([...REQUIRED_RESTORE_REHEARSAL_CHECKS]),
      restoredFileCount: input.report.restoredFiles.length,
      promptSourceCount: input.report.promptSourceCount,
      migration: Object.freeze({
        currentVersion: migration.currentVersion,
        latestVersion: migration.latestVersion,
        upToDate: true,
      }),
    }),
  })
  return { status: "ready", receipt }
}

export function verifyBackupRestoreRehearsalReceipt(input: {
  receipt: unknown
  manifest: unknown
  snapshotVerification: Readonly<SnapshotVerificationResult>
}): BackupRestoreReceiptVerificationResult {
  if (!objectRecord(input.receipt) || !validSnapshotIdentity(input.manifest)) {
    return { status: "rejected", reasonCode: "backup_restore_receipt_invalid" }
  }
  if (!input.snapshotVerification.ok || input.snapshotVerification.failures.length > 0) {
    return { status: "rejected", reasonCode: "snapshot_checksum_failed" }
  }
  const receipt = input.receipt
  const snapshot = receipt.snapshot
  const restore = receipt.restore
  if (
    receipt.kind !== "knowbee.release.backup_restore_rehearsal_receipt" ||
    receipt.schemaVersion !== 1 ||
    receipt.status !== "passed" ||
    !Number.isSafeInteger(receipt.issuedAt) ||
    Number(receipt.issuedAt) < 0 ||
    !objectRecord(snapshot) ||
    !objectRecord(restore) ||
    !objectRecord(restore.migration) ||
    typeof snapshot.id !== "string" ||
    typeof snapshot.checksum !== "string" ||
    typeof snapshot.appVersion !== "string" ||
    (snapshot.gitTag !== null && typeof snapshot.gitTag !== "string") ||
    (snapshot.gitCommit !== null && typeof snapshot.gitCommit !== "string") ||
    !Number.isSafeInteger(snapshot.schemaVersion) ||
    !Number.isSafeInteger(snapshot.latestSchemaVersion) ||
    restore.checkCount !== 5 ||
    !checkNames(restore.checks) ||
    !Number.isSafeInteger(restore.restoredFileCount) ||
    Number(restore.restoredFileCount) < 0 ||
    !Number.isSafeInteger(restore.promptSourceCount) ||
    Number(restore.promptSourceCount) < 1 ||
    !Number.isSafeInteger(restore.migration.currentVersion) ||
    !Number.isSafeInteger(restore.migration.latestVersion) ||
    restore.migration.upToDate !== true
  ) {
    return { status: "rejected", reasonCode: "backup_restore_receipt_invalid" }
  }
  if (snapshot.id !== input.manifest.id) {
    return { status: "rejected", reasonCode: "snapshot_id_mismatch" }
  }
  if (snapshot.checksum !== input.manifest.checksum) {
    return { status: "rejected", reasonCode: "snapshot_checksum_mismatch" }
  }
  if (
    snapshot.appVersion !== input.manifest.appVersion ||
    snapshot.gitTag !== (input.manifest.gitTag ?? null) ||
    snapshot.gitCommit !== (input.manifest.gitCommit ?? null) ||
    snapshot.schemaVersion !== input.manifest.schemaVersion ||
    snapshot.latestSchemaVersion !== input.manifest.latestSchemaVersion ||
    restore.restoredFileCount !== input.manifest.files.length ||
    restore.migration.currentVersion !== input.manifest.schemaVersion ||
    restore.migration.latestVersion !== input.manifest.latestSchemaVersion
  ) {
    return { status: "rejected", reasonCode: "snapshot_identity_binding_mismatch" }
  }
  return { status: "verified" }
}
