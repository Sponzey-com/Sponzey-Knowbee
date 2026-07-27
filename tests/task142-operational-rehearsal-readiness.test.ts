import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import type {
  BackupSnapshotManifest,
  RestoreRehearsalReport,
} from "../packages/core/src/config/backup-rehearsal.js"
import {
  createBackupSnapshot,
  verifyBackupSnapshotManifest,
} from "../packages/core/src/config/backup-rehearsal.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.js"
import { buildBackupRestoreRehearsalReceipt } from "../packages/core/src/release/backup-restore-receipt.js"
import { buildNpmCleanInstallReceipt } from "../packages/core/src/release/npm-install-receipt.js"
import { verifyOperationalRehearsalEvidence } from "../packages/core/src/release/operational-rehearsal-evidence.js"
import {
  type ReleaseManifest,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  writePreparedReleasePackage,
} from "../packages/core/src/release/package.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.js"

const digest = (character: string) => character.repeat(64)
const tempDirs: string[] = []
const candidate = { appVersion: "0.1.0", gitTag: "v0.1.0", gitCommit: "abc123" }
const snapshotVerification = { ok: true, checked: 1, failures: [] }
const stagedPackages = [
  { name: "@sponzey/cli", version: "0.1.0", digestSha256: digest("a") },
  { name: "@sponzey/core", version: "0.1.0", digestSha256: digest("b") },
  { name: "@sponzey/knowbee", version: "0.1.0", digestSha256: digest("c") },
  { name: "@sponzey/webui", version: "0.1.0", digestSha256: digest("d") },
] as const
const artifactCleanupSmokeReceipt = {
  kind: "knowbee.artifact_cleanup_cli_smoke",
  status: "passed",
  checked: ["preview", "confirmation_failure"],
} as const

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function makeOtherwiseReady(manifest: ReleaseManifest): void {
  manifest.requiredMissing = []
  manifest.updatePreflight.ok = true
  manifest.migrationPreflight.ok = true
  manifest.performanceEvidence.gateStatus = "passed"
  manifest.benchmarkEvidence.gateStatus = "passed"
  manifest.subAgentReleaseGate.gateStatus = "passed"
  manifest.enterpriseTopologyReleaseGate.gateStatus = "passed"
  manifest.orchestrationEvidence.gateStatus = "passed"
  manifest.webRetrievalEvidence.gateStatus = "passed"
  manifest.uiModeEvidence.gateStatus = "passed"
  manifest.yeonjangMultiInstanceEvidence.gateStatus = "passed"
  manifest.yeonjangBrowserActiveTabInfoReleaseGate = {
    ...manifest.yeonjangBrowserActiveTabInfoReleaseGate,
    gateStatus: "ready_for_manual_live_integration_review",
    missingGateIds: [],
    blockingReasonCodes: [],
  }
  manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness = {
    ...manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness,
    missingSourceCount: 0,
    missingTestCount: 0,
    staleTestCount: 0,
    rejectedSkippedTestCount: 0,
    rejectedUnknownTestCount: 0,
    rejectedPublicRawReportCount: 0,
    failingTestCount: 0,
  }
  manifest.memoryCompactionEvidence.gateStatus = "passed"
  manifest.liveAcceptance = { status: "admitted", reasonCodes: [], acceptedEvidenceRefs: [] }
}

function backupManifest(): BackupSnapshotManifest {
  return {
    kind: "knowbee.backup.snapshot",
    version: 1,
    id: "snapshot:task142",
    createdAt: 100,
    snapshotDir: "/private/snapshot",
    appVersion: candidate.appVersion,
    gitTag: candidate.gitTag,
    gitCommit: candidate.gitCommit,
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
        checksum: digest("e"),
      },
    ],
    excluded: [],
    promptSources: [],
    logicalCoverage: ["audit_logs"],
    secretReentryRequired: [],
    checksum: digest("f"),
  }
}

function restoreReport(): RestoreRehearsalReport {
  return {
    ok: true,
    snapshotId: "snapshot:task142",
    restoredDir: "/private/restore",
    checks: [
      { name: "manifest_checksum", ok: true, message: "private" },
      { name: "file_copy", ok: true, message: "private" },
      { name: "sqlite_integrity", ok: true, message: "private" },
      { name: "migration_status", ok: true, message: "private" },
      { name: "prompt_source_registry", ok: true, message: "private" },
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

function validInput() {
  const npm = buildNpmCleanInstallReceipt({
    packages: stagedPackages,
    runtime: {
      nodeVersion: "v22.17.0",
      npmVersion: "10.9.2",
      platform: "darwin",
      arch: "arm64",
    },
    issuedAt: 1,
    cliHelpVerified: true,
  })
  const backup = buildBackupRestoreRehearsalReceipt({
    manifest: backupManifest(),
    snapshotVerification,
    report: restoreReport(),
    issuedAt: 1,
  })
  if (npm.status !== "ready" || backup.status !== "ready") {
    throw new Error("task142 fixtures must produce receipts")
  }
  return {
    candidate,
    npmReceipt: npm.receipt,
    stagedPackages,
    backupReceipt: backup.receipt,
    backupManifest: backupManifest(),
    snapshotVerification,
    artifactCleanupSmokeReceipt,
  }
}

describe("task142 operational rehearsal release evidence", () => {
  it("verifies both receipts against one exact release candidate", () => {
    expect(verifyOperationalRehearsalEvidence(validInput())).toEqual({
      kind: "knowbee.release.operational_rehearsal_evidence",
      schemaVersion: 1,
      status: "passed",
      reasonCodes: [],
      npmInstall: {
        status: "verified",
        reasonCode: null,
        packageVersion: "0.1.0",
        packageSetDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      backupRestore: {
        status: "verified",
        reasonCode: null,
        snapshotId: "snapshot:task142",
        snapshotChecksum: digest("f"),
        schemaVersion: 62,
      },
      artifactCleanupSmoke: {
        status: "verified",
        reasonCode: null,
        checked: ["preview", "confirmation_failure"],
        destructiveFixtureVerified: false,
      },
    })
  })

  it("fails closed with stable reasons when evidence is absent", () => {
    const input = validInput()
    expect(
      verifyOperationalRehearsalEvidence({
        ...input,
        npmReceipt: null,
        backupReceipt: null,
        backupManifest: null,
        artifactCleanupSmokeReceipt: null,
      }),
    ).toMatchObject({
      status: "failed",
      reasonCodes: [
        "npm_install_receipt_missing",
        "backup_restore_receipt_missing",
        "artifact_cleanup_smoke_receipt_missing",
      ],
      npmInstall: { status: "missing", reasonCode: "npm_install_receipt_missing" },
      backupRestore: { status: "missing", reasonCode: "backup_restore_receipt_missing" },
      artifactCleanupSmoke: {
        status: "missing",
        reasonCode: "artifact_cleanup_smoke_receipt_missing",
      },
    })
  })

  it("rejects malformed artifact cleanup smoke receipts without exposing internal details", () => {
    const summary = verifyOperationalRehearsalEvidence({
      ...validInput(),
      artifactCleanupSmokeReceipt: {
        kind: "knowbee.artifact_cleanup_cli_smoke",
        status: "passed",
        checked: ["preview", "private/release", "unsafe_symlink"],
      },
    })
    expect(summary).toMatchObject({
      status: "failed",
      reasonCodes: ["artifact_cleanup_smoke:artifact_cleanup_smoke_checked_invalid"],
      artifactCleanupSmoke: {
        status: "rejected",
        reasonCode: "artifact_cleanup_smoke:artifact_cleanup_smoke_checked_invalid",
        checked: [],
      },
    })
    expect(JSON.stringify(summary)).not.toMatch(/private|unsafe_symlink|reasonCounts|app\.tar\.gz/u)
  })

  it("rejects changed package content and failed current snapshot verification", () => {
    const input = validInput()
    const summary = verifyOperationalRehearsalEvidence({
      ...input,
      stagedPackages: input.stagedPackages.map((item) =>
        item.name === "@sponzey/core" ? { ...item, digestSha256: digest("9") } : item,
      ),
      snapshotVerification: { ok: false, checked: 1, failures: [] },
    })
    expect(summary).toMatchObject({
      status: "failed",
      reasonCodes: [
        "npm_install:package_digest_mismatch:@sponzey/core",
        "backup_restore:snapshot_checksum_failed",
      ],
      npmInstall: { status: "rejected" },
      backupRestore: { status: "rejected" },
    })
  })

  it("rejects receipts produced for a different release candidate", () => {
    const summary = verifyOperationalRehearsalEvidence({
      ...validInput(),
      candidate: { ...candidate, appVersion: "0.1.1", gitCommit: "def456" },
    })
    expect(summary).toMatchObject({
      status: "failed",
      reasonCodes: [
        "npm_install_candidate_version_mismatch",
        "backup_restore_candidate_identity_mismatch",
      ],
    })
  })

  it("keeps raw paths, runtime identity and check messages out of the summary", () => {
    const serialized = JSON.stringify(verifyOperationalRehearsalEvidence(validInput()))
    expect(serialized).not.toMatch(/private|sourcePath|snapshotPath|restoredDir|message/)
    expect(serialized).not.toMatch(/nodeVersion|npmVersion|platform|arch/)
  })

  it("blocks release writes until both operational receipts verify", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task142-release-"))
    tempDirs.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    const evidence = validInput()
    const manifest = buildReleaseManifest({
      rootDir,
      runtimePaths: runtime.paths,
      targetPlatforms: [],
      now: new Date("2026-07-17T00:00:00.000Z"),
      gitTag: candidate.gitTag,
      gitCommit: candidate.gitCommit,
      operationalRehearsalEvidence: {
        npmReceipt: evidence.npmReceipt,
        stagedPackages: evidence.stagedPackages,
        backupReceipt: evidence.backupReceipt,
        backupManifest: evidence.backupManifest,
        snapshotVerification: evidence.snapshotVerification,
        artifactCleanupSmokeReceipt: evidence.artifactCleanupSmokeReceipt,
      },
    })
    makeOtherwiseReady(manifest)
    expect(manifest.version).toBe(2)
    expect(manifest.operationalRehearsalEvidence.status).toBe("passed")
    expect(evaluateReleaseReadiness(manifest)).toEqual({ status: "ready", blockerCodes: [] })

    const missing = buildReleaseManifest({
      rootDir,
      runtimePaths: runtime.paths,
      targetPlatforms: [],
      now: new Date("2026-07-17T00:00:00.000Z"),
      gitTag: candidate.gitTag,
      gitCommit: candidate.gitCommit,
    })
    makeOtherwiseReady(missing)
    expect(evaluateReleaseReadiness(missing)).toEqual({
      status: "blocked",
      blockerCodes: [
        "npm_install_rehearsal_failed",
        "backup_restore_rehearsal_failed",
        "artifact_cleanup_smoke_failed",
      ],
    })
    const outputDir = join(rootDir, "blocked-publication")
    expect(() =>
      writePreparedReleasePackage({ manifest: missing, outputDir, copyPayload: false }),
    ).toThrow(
      "npm_install_rehearsal_failed,backup_restore_rehearsal_failed,artifact_cleanup_smoke_failed",
    )
    expect(existsSync(outputDir)).toBe(false)
  })

  it("loads exact staged packages and a verified snapshot through the dry-run CLI", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task142-cli-"))
    const stageDir = mkdtempSync(join(tmpdir(), "knowbee-task142-stage-"))
    const snapshotDir = mkdtempSync(join(tmpdir(), "knowbee-task142-snapshot-"))
    tempDirs.push(rootDir, stageDir, snapshotDir)

    execFileSync(
      process.execPath,
      ["scripts/package-npm.mjs", "--version", "0.1.0", "--output-dir", stageDir],
      { cwd: resolve("."), stdio: "pipe" },
    )
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    initializeTestDbRuntime(runtime.paths.stateDir)
    ensurePromptSourceFiles(rootDir)
    const gitTag = execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      cwd: resolve("."),
      encoding: "utf8",
    }).trim()
    const gitCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: resolve("."),
      encoding: "utf8",
    }).trim()
    const snapshot = createBackupSnapshot({
      paths: runtime.paths,
      workDir: rootDir,
      snapshotDir,
      appVersion: "0.1.0",
      gitTag,
      gitCommit,
      checkpointSqlite: false,
      now: 1_768_521_600_000,
    })
    const verification = verifyBackupSnapshotManifest(snapshot)
    expect(verification.ok).toBe(true)
    closeDb()

    const backupManifestPath = join(rootDir, "backup-manifest.json")
    writeFileSync(backupManifestPath, JSON.stringify(snapshot))
    const outputDir = join(rootDir, "dry-run-output")
    const command = spawnSync(
      process.execPath,
      [
        "scripts/release-package.mjs",
        "--dry-run",
        "--json",
        "--no-copy",
        "--output-dir",
        outputDir,
        "--run-operational-rehearsals",
        "--npm-stage-dir",
        stageDir,
        "--backup-snapshot-manifest",
        backupManifestPath,
      ],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, KNOWBEE_STATE_DIR: runtime.paths.stateDir },
      },
    )
    expect(command.status, command.stderr).toBe(0)
    const result = JSON.parse(command.stdout)
    expect(result.manifest.operationalRehearsalEvidence).toMatchObject({
      status: "passed",
      npmInstall: { status: "verified", packageVersion: "0.1.0" },
      backupRestore: { status: "verified", snapshotId: snapshot.id },
      artifactCleanupSmoke: {
        status: "verified",
        checked: ["preview", "confirmation_failure"],
        destructiveFixtureVerified: false,
      },
    })
    expect(result.readiness.blockerCodes).not.toContain("npm_install_rehearsal_failed")
    expect(result.readiness.blockerCodes).not.toContain("backup_restore_rehearsal_failed")
    expect(result.readiness.blockerCodes).not.toContain("artifact_cleanup_smoke_failed")
    expect(existsSync(outputDir)).toBe(false)
  }, 120_000)
})
