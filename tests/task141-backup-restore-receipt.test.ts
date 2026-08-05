import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import type {
  BackupSnapshotManifest,
  RestoreRehearsalReport,
  SnapshotVerificationResult,
} from "../packages/core/src/config/backup-rehearsal.js"
import { createBackupSnapshot } from "../packages/core/src/config/backup-rehearsal.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.js"
import {
  buildBackupRestoreRehearsalReceipt,
  verifyBackupRestoreRehearsalReceipt,
} from "../packages/core/src/release/backup-restore-receipt.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.js"

const tempDirs: string[] = []

function manifest(): BackupSnapshotManifest {
  return {
    kind: "knowbee.backup.snapshot",
    version: 1,
    id: "snapshot:task141",
    createdAt: 100,
    snapshotDir: "/private/snapshot",
    appVersion: "0.1.0",
    gitTag: "v0.1.0",
    gitCommit: "abc123",
    schemaVersion: 62,
    latestSchemaVersion: 62,
    files: [
      {
        id: "sqlite:main",
        kind: "sqlite_db",
        sourcePath: "/private/state/data.db",
        relativePath: "state/data.db",
        snapshotPath: "/private/snapshot/files/state/data.db",
        sizeBytes: 10,
        checksum: "a".repeat(64),
      },
    ],
    excluded: [],
    promptSources: [],
    logicalCoverage: ["audit_logs"],
    secretReentryRequired: [],
    checksum: "b".repeat(64),
  }
}

function report(): RestoreRehearsalReport {
  return {
    ok: true,
    snapshotId: manifest().id,
    restoredDir: "/private/restore",
    checks: [
      { name: "manifest_checksum", ok: true, message: "private manifest message" },
      { name: "file_copy", ok: true, message: "private copy message" },
      { name: "sqlite_integrity", ok: true, message: "private sqlite message" },
      { name: "migration_status", ok: true, message: "private migration message" },
      { name: "prompt_source_registry", ok: true, message: "private prompt message" },
    ],
    restoredFiles: ["/private/restore/state/data.db"],
    migrationStatus: {
      databasePath: "/private/restore/state/data.db",
      exists: true,
      currentVersion: 62,
      latestVersion: 62,
      appliedVersions: [62],
      pendingVersions: [],
      unknownAppliedVersions: [],
      upToDate: true,
    },
    promptSourceCount: 1,
  }
}

function migrationStatus(): NonNullable<RestoreRehearsalReport["migrationStatus"]> {
  const status = report().migrationStatus
  if (!status) throw new Error("task141 fixture migration status is required")
  return status
}

const verified: SnapshotVerificationResult = { ok: true, checked: 2, failures: [] }

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task141 backup restore receipt", () => {
  it("builds and verifies a bounded receipt for an exact successful snapshot rehearsal", () => {
    const built = buildBackupRestoreRehearsalReceipt({
      manifest: manifest(),
      snapshotVerification: verified,
      report: report(),
      issuedAt: 1_768_521_600_000,
    })

    expect(built.status).toBe("ready")
    if (built.status !== "ready") return
    expect(built.receipt).toEqual({
      kind: "knowbee.release.backup_restore_rehearsal_receipt",
      schemaVersion: 1,
      status: "passed",
      issuedAt: 1_768_521_600_000,
      snapshot: {
        id: "snapshot:task141",
        checksum: "b".repeat(64),
        appVersion: "0.1.0",
        gitTag: "v0.1.0",
        gitCommit: "abc123",
        schemaVersion: 62,
        latestSchemaVersion: 62,
      },
      restore: {
        checkCount: 5,
        checks: [
          "manifest_checksum",
          "file_copy",
          "sqlite_integrity",
          "migration_status",
          "prompt_source_registry",
        ],
        restoredFileCount: 1,
        promptSourceCount: 1,
        migration: { currentVersion: 62, latestVersion: 62, upToDate: true },
      },
    })
    expect(
      verifyBackupRestoreRehearsalReceipt({
        receipt: built.receipt,
        manifest: manifest(),
        snapshotVerification: verified,
      }),
    ).toEqual({ status: "verified" })
    expect(JSON.stringify(built.receipt)).not.toMatch(/sourcePath|snapshotPath|restoredDir|message/)
  })

  it.each([
    ["invalid snapshot", { ...verified, ok: false }, report(), "snapshot_checksum_failed"],
    [
      "snapshot mismatch",
      verified,
      { ...report(), snapshotId: "snapshot:other" },
      "restore_snapshot_binding_mismatch",
    ],
    [
      "missing check",
      verified,
      { ...report(), checks: report().checks.slice(1) },
      "restore_check_missing:manifest_checksum",
    ],
    [
      "failed check",
      verified,
      {
        ...report(),
        checks: report().checks.map((check) =>
          check.name === "sqlite_integrity" ? { ...check, ok: false } : check,
        ),
      },
      "restore_check_failed:sqlite_integrity",
    ],
    [
      "pending migration",
      verified,
      {
        ...report(),
        migrationStatus: {
          ...migrationStatus(),
          upToDate: false,
          pendingVersions: [63],
        },
      },
      "restore_migration_not_current",
    ],
  ])("rejects %s", (_name, snapshotVerification, rehearsal, reasonCode) => {
    expect(
      buildBackupRestoreRehearsalReceipt({
        manifest: manifest(),
        snapshotVerification,
        report: rehearsal,
        issuedAt: 1,
      }),
    ).toEqual({ status: "rejected", reasonCode })
  })

  it("rejects malformed receipts and exact snapshot checksum changes", () => {
    expect(
      verifyBackupRestoreRehearsalReceipt({
        receipt: { packages: [null] },
        manifest: null,
        snapshotVerification: verified,
      }),
    ).toEqual({ status: "rejected", reasonCode: "backup_restore_receipt_invalid" })
    const built = buildBackupRestoreRehearsalReceipt({
      manifest: manifest(),
      snapshotVerification: verified,
      report: report(),
      issuedAt: 1,
    })
    expect(built.status).toBe("ready")
    if (built.status !== "ready") return
    expect(
      verifyBackupRestoreRehearsalReceipt({
        receipt: built.receipt,
        manifest: { ...manifest(), checksum: "c".repeat(64) },
        snapshotVerification: verified,
      }),
    ).toEqual({ status: "rejected", reasonCode: "snapshot_checksum_mismatch" })
    expect(
      verifyBackupRestoreRehearsalReceipt({
        receipt: built.receipt,
        manifest: manifest(),
        snapshotVerification: { ok: false, checked: 1, failures: [] },
      }),
    ).toEqual({ status: "rejected", reasonCode: "snapshot_checksum_failed" })
  })

  it("runs the bounded CLI without modifying or exposing source snapshot paths", () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "SECRET_TASK141_SOURCE-"))
    const workDir = mkdtempSync(join(tmpdir(), "knowbee-task141-work-"))
    const snapshotDir = mkdtempSync(join(tmpdir(), "knowbee-task141-snapshot-"))
    tempDirs.push(sourceRoot, workDir, snapshotDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir: sourceRoot })
    initializeTestDbRuntime(runtime.paths.stateDir)
    ensurePromptSourceFiles(workDir)
    const snapshot = createBackupSnapshot({
      paths: runtime.paths,
      workDir,
      snapshotDir,
      appVersion: "0.1.0",
      gitTag: "v0.1.0",
      gitCommit: "abc123",
      checkpointSqlite: false,
      now: 1_768_521_600_000,
    })
    closeDb()
    const sourceBefore = snapshot.files.map((file) => ({
      path: file.snapshotPath,
      checksum: createHash("sha256").update(readFileSync(file.snapshotPath)).digest("hex"),
    }))

    const command = spawnSync(
      process.execPath,
      [
        "scripts/self/audit-backup-restore-rehearsal.mjs",
        "--manifest",
        join(snapshotDir, "manifest.json"),
        "--json",
      ],
      { cwd: resolve("."), encoding: "utf8" },
    )
    expect(command.status, command.stderr).toBe(0)
    expect(JSON.parse(command.stdout)).toMatchObject({
      kind: "knowbee.release.backup_restore_rehearsal_receipt",
      schemaVersion: 1,
      status: "passed",
      snapshot: { id: snapshot.id, checksum: snapshot.checksum },
    })
    expect(command.stdout).not.toMatch(
      /SECRET_TASK141_SOURCE|sourcePath|snapshotPath|restoredDir|message|secretReentryRequired/,
    )
    expect(
      snapshot.files.map((file) => ({
        path: file.snapshotPath,
        checksum: createHash("sha256").update(readFileSync(file.snapshotPath)).digest("hex"),
      })),
    ).toEqual(sourceBefore)
  }, 120_000)
})
