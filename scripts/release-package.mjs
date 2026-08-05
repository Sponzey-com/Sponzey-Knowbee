#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  runRestoreRehearsal,
  verifyBackupSnapshotManifest,
} from "../packages/core/src/config/backup-rehearsal.js"
import { redactLogText } from "../packages/core/src/logger/index.js"
import { parseLivePerformanceAcceptanceCliArguments } from "../packages/core/src/maintenance/live-performance-acceptance-cli.js"
import { SqliteLivePerformanceEvidenceSource } from "../packages/core/src/maintenance/sqlite-live-performance-evidence-source.js"
import { buildBackupRestoreRehearsalReceipt } from "../packages/core/src/release/backup-restore-receipt.js"
import { parseLiveAcceptanceBundle } from "../packages/core/src/release/live-acceptance-bundle.js"
import { SqlitePerformanceAcceptanceAuthorizationRepository } from "../packages/core/src/release/sqlite-performance-acceptance-authorization-repository.js"
import { loadTrustedLiveAcceptanceVerifier } from "./self/lib/live-acceptance-verifier.mjs"
import { captureStagedNpmPackageSet, runNpmCleanInstallSmoke } from "./self/smoke-npm-install.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, "..")
const releaseModulePath = resolve(rootDir, "packages/core/src/release/package.js")
const runtimePathsModulePath = resolve(rootDir, "packages/core/src/config/paths.js")
const rolloutPolicyRepositoryModulePath = resolve(
  rootDir,
  "packages/core/src/release/sqlite-release-policy-authorization-repository.js",
)
const requireFromCore = createRequire(new URL("../packages/core/package.json", import.meta.url))
const BetterSqlite3 = requireFromCore("better-sqlite3")
const RELEASE_PROCESS_ENV = Object.freeze({ ...process.env })
const RELEASE_PACKAGE_ENV = Object.freeze({
  processEnv: RELEASE_PROCESS_ENV,
  liveWebSmokeEnabled: RELEASE_PROCESS_ENV.KNOWBEE_LIVE_WEB_SMOKE === "1",
})

function writeDevelopmentFailure(scope, error) {
  if (RELEASE_PACKAGE_ENV.processEnv.KNOWBEE_LOG_LEVEL !== "development") return
  const details = [
    error instanceof Error ? error.message : String(error),
    error && typeof error === "object" && "stderr" in error ? String(error.stderr ?? "") : "",
  ]
    .filter(Boolean)
    .join("\n")
  console.error(
    JSON.stringify({
      level: "development",
      scope,
      reason: redactLogText(details),
    }),
  )
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    json: false,
    copyPayload: true,
    outputDir: null,
    targetPlatforms: [],
    skipTests: false,
    skipSmoke: false,
    skipYeonjang: false,
    rolloutPolicyId: null,
    rolloutPolicyVersion: null,
    rolloutPolicyMode: null,
    rolloutDatabasePath: null,
    performanceSelection: null,
    runOperationalRehearsals: false,
    npmStageDir: null,
    backupSnapshotManifestPath: null,
    liveAcceptanceBundlePath: null,
    liveAcceptancePublicKeyPath: null,
  }
  const performanceArguments = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--json") options.json = true
    else if (arg === "--no-copy") options.copyPayload = false
    else if (arg === "--skip-tests") options.skipTests = true
    else if (arg === "--skip-smoke") options.skipSmoke = true
    else if (arg === "--skip-yeonjang") options.skipYeonjang = true
    else if (arg === "--output-dir") options.outputDir = argv[++index] ?? null
    else if (arg === "--rollout-policy-id") options.rolloutPolicyId = argv[++index] ?? null
    else if (arg === "--rollout-policy-version")
      options.rolloutPolicyVersion = argv[++index] ?? null
    else if (arg === "--rollout-policy-mode") options.rolloutPolicyMode = argv[++index] ?? null
    else if (arg === "--rollout-database") {
      const value = argv[++index]
      if (!value || value.startsWith("--")) throw new Error("rollout_policy_database_required")
      options.rolloutDatabasePath = value
    } else if (arg === "--run-operational-rehearsals") options.runOperationalRehearsals = true
    else if (arg === "--npm-stage-dir") options.npmStageDir = argv[++index] ?? null
    else if (arg === "--backup-snapshot-manifest")
      options.backupSnapshotManifestPath = argv[++index] ?? null
    else if (arg === "--live-acceptance-bundle") {
      options.liveAcceptanceBundlePath = argv[++index] ?? null
      if (!options.liveAcceptanceBundlePath?.trim()) {
        throw new Error("live_acceptance_bundle_path_required")
      }
    } else if (arg === "--live-acceptance-public-key") {
      options.liveAcceptancePublicKeyPath = argv[++index] ?? null
      if (!options.liveAcceptancePublicKeyPath?.trim()) {
        throw new Error("live_acceptance_public_key_path_required")
      }
    } else if (arg === "--npm-install-receipt" || arg === "--backup-restore-receipt")
      throw new Error("external_operational_receipt_forbidden")
    else if (
      arg === "--database" ||
      arg === "--matrix-id" ||
      arg === "--matrix-version" ||
      arg === "--baseline-version" ||
      arg === "--run"
    ) {
      performanceArguments.push(arg)
      const value = argv[++index]
      if (value !== undefined) performanceArguments.push(value)
    } else if (arg === "--platform") {
      const value = argv[++index]
      if (value) options.targetPlatforms.push(value)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  const selectorValues = [
    options.rolloutPolicyId,
    options.rolloutPolicyVersion,
    options.rolloutPolicyMode,
  ]
  const selectorValueCount = selectorValues.filter((value) => value !== null).length
  if (selectorValueCount > 0 && selectorValueCount < selectorValues.length) {
    throw new Error(
      "Rollout policy selector requires --rollout-policy-id, --rollout-policy-version, and --rollout-policy-mode.",
    )
  }
  if (selectorValueCount === selectorValues.length) {
    if (!options.rolloutPolicyId.trim()) {
      throw new Error("Rollout policy ID must be a non-empty value.")
    }
    if (!/^[1-9][0-9]*$/.test(options.rolloutPolicyVersion)) {
      throw new Error("Rollout policy version must be a positive integer.")
    }
    const policyVersion = Number(options.rolloutPolicyVersion)
    if (!Number.isSafeInteger(policyVersion)) {
      throw new Error("Rollout policy version must be a safe positive integer.")
    }
    if (
      options.rolloutPolicyMode !== "limited_beta" &&
      options.rolloutPolicyMode !== "full_enable"
    ) {
      throw new Error("Rollout policy mode must be limited_beta or full_enable.")
    }
    options.rolloutPolicyVersion = policyVersion
    if (!options.rolloutDatabasePath?.trim()) {
      throw new Error("rollout_policy_database_required")
    }
  } else if (options.rolloutDatabasePath !== null) {
    throw new Error("rollout_policy_selector_required")
  }
  if (performanceArguments.length > 0) {
    const parsed = parseLivePerformanceAcceptanceCliArguments(performanceArguments)
    if (parsed.status === "rejected") throw new Error(parsed.reasonCode)
    options.performanceSelection = parsed
  }
  if (
    options.runOperationalRehearsals &&
    (!options.npmStageDir || !options.backupSnapshotManifestPath)
  ) {
    throw new Error("operational_rehearsal_arguments_incomplete")
  }
  if (
    !options.runOperationalRehearsals &&
    (options.npmStageDir || options.backupSnapshotManifestPath)
  ) {
    throw new Error("operational_rehearsal_mode_required")
  }
  if (Boolean(options.liveAcceptanceBundlePath) !== Boolean(options.liveAcceptancePublicKeyPath)) {
    throw new Error("live_acceptance_signature_arguments_incomplete")
  }
  return options
}

function loadLiveAcceptanceBundle(path, expectedCandidate, now, verifySignature) {
  const bundlePath = resolve(path)
  let value
  try {
    const stat = lstatSync(bundlePath)
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0 || stat.size > 1024 * 1024) {
      throw new Error("live_acceptance_bundle_path_unsafe")
    }
    value = JSON.parse(readFileSync(bundlePath, "utf8"))
  } catch (error) {
    if (error instanceof Error && error.message === "live_acceptance_bundle_path_unsafe") {
      throw error
    }
    throw new Error("live_acceptance_bundle_load_failed")
  }
  const parsed = parseLiveAcceptanceBundle({ value, expectedCandidate, now, verifySignature })
  if (parsed.status === "rejected") throw new Error(parsed.reasonCode)
  return parsed.bundle
}

function readSnapshotManifest(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    throw new Error("backup_snapshot_manifest_load_failed")
  }
}

function openReadOnlyDatabase(path, reasonCode) {
  const databasePath = resolve(path)
  try {
    const stat = lstatSync(databasePath)
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1) throw new Error(reasonCode)
    return new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true })
  } catch (error) {
    if (error instanceof Error && error.message === reasonCode) throw error
    throw new Error(reasonCode)
  }
}

function verifySnapshot(manifest, reasonCode) {
  try {
    const verification = verifyBackupSnapshotManifest(manifest)
    if (!verification.ok || verification.failures.length > 0) throw new Error(reasonCode)
    return verification
  } catch (error) {
    if (error instanceof Error && error.message === reasonCode) throw error
    throw new Error(reasonCode)
  }
}

function runReleaseOperationalRehearsals(options) {
  const stageDir = resolve(options.stageDir)
  const snapshotManifestPath = resolve(options.snapshotManifestPath)
  let npmReceipt
  try {
    npmReceipt = runNpmCleanInstallSmoke({
      stageDir,
      platform: options.platform,
      arch: options.arch,
      nodeCommand: options.nodeCommand,
      processEnv: options.processEnv,
      issuedAt: options.issuedAt,
    })
  } catch (error) {
    writeDevelopmentFailure("release.npm_clean_install", error)
    throw new Error("npm_clean_install_rehearsal_failed")
  }

  let stagedPackages
  try {
    stagedPackages = captureStagedNpmPackageSet(stageDir).packages.map(
      ({ name, version, digestSha256 }) => ({ name, version, digestSha256 }),
    )
  } catch {
    throw new Error("npm_stage_reverification_failed")
  }

  let artifactCleanupSmokeReceipt
  try {
    const build = spawnSync("pnpm", ["--filter", "@knowbee/cli", "build"], {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...RELEASE_PACKAGE_ENV.processEnv, KNOWBEE_LOG_LEVEL: "product" },
      shell: process.platform === "win32",
    })
    if (build.error) throw build.error
    if (build.status !== 0) {
      const error = new Error("artifact_cleanup_cli_build_failed")
      error.stderr = build.stderr
      throw error
    }
    const smoke = spawnSync(process.execPath, ["scripts/self/smoke-artifact-cleanup-cli.mjs"], {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...RELEASE_PACKAGE_ENV.processEnv, KNOWBEE_LOG_LEVEL: "product" },
    })
    if (smoke.error) throw smoke.error
    if (smoke.status !== 0) {
      const error = new Error("artifact_cleanup_smoke_failed")
      error.stderr = smoke.stderr
      throw error
    }
    artifactCleanupSmokeReceipt = JSON.parse(smoke.stdout)
  } catch (error) {
    writeDevelopmentFailure("release.artifact_cleanup_smoke", error)
    throw new Error("artifact_cleanup_smoke_failed")
  }

  const backupManifest = readSnapshotManifest(snapshotManifestPath)
  const initialVerification = verifySnapshot(backupManifest, "backup_snapshot_checksum_failed")
  const restoreDir = mkdtempSync(join(tmpdir(), "knowbee-release-restore-rehearsal-"))
  try {
    let report
    try {
      report = runRestoreRehearsal({ manifest: backupManifest, restoreDir })
    } catch {
      throw new Error("backup_restore_rehearsal_failed")
    }
    const backupReceipt = buildBackupRestoreRehearsalReceipt({
      manifest: backupManifest,
      snapshotVerification: initialVerification,
      report,
      issuedAt: options.issuedAt,
    })
    if (backupReceipt.status === "rejected") throw new Error(backupReceipt.reasonCode)
    const finalVerification = verifySnapshot(
      backupManifest,
      "backup_snapshot_changed_after_restore",
    )
    return Object.freeze({
      npmReceipt,
      stagedPackages: Object.freeze(stagedPackages),
      backupReceipt: backupReceipt.receipt,
      backupManifest,
      snapshotVerification: finalVerification,
      artifactCleanupSmokeReceipt,
    })
  } finally {
    rmSync(restoreDir, { recursive: true, force: true })
  }
}

function runCommand(command, options = {}) {
  const [program, ...args] = command
  const result = spawnSync(program, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...RELEASE_PACKAGE_ENV.processEnv, ...options.env },
  })
  if (result.status !== 0) throw new Error(`Command failed: ${command.join(" ")}`)
}

function filterPipelineSteps(steps, options) {
  return steps.filter((step) => {
    if (options.skipTests && (step.id === "unit-tests" || step.id === "typecheck")) return false
    if (options.skipSmoke && step.smoke) return false
    if (options.skipYeonjang && step.id.startsWith("yeonjang-")) return false
    if (step.id === "web-retrieval-live-smoke" && !RELEASE_PACKAGE_ENV.liveWebSmokeEnabled)
      return false
    if (
      step.id === "environment-preflight" ||
      step.id === "release-approval-candidate-preparation" ||
      step.id === "package-manifest" ||
      step.id === "live-smoke-gate"
    )
      return false
    return true
  })
}

function printHumanSummary(result, dryRun, readiness, readinessFailureSummary = { lines: [] }) {
  const manifest = result.manifest
  const auditVerification = result.activeTabInfoAuditVerification
  console.log(`${dryRun ? "Release dry-run" : "Release package"}: ${manifest.releaseVersion}`)
  console.log(`  output: ${result.outputDir}`)
  console.log(`  manifest: ${result.manifestPath}`)
  console.log(`  checksums: ${result.checksumPath}`)
  console.log(`  readiness: ${readiness.status} (${readiness.blockerCodes.length} blockers)`)
  for (const line of readinessFailureSummary.lines) {
    console.log(`  readiness detail: ${line}`)
  }
  console.log(
    `  artifacts: ${manifest.artifacts.filter((artifact) => artifact.status === "present").length} present, ${manifest.requiredMissing.length} required missing`,
  )
  if (auditVerification?.summary) {
    const summary = auditVerification.summary
    const counts = summary.evidenceCountSummary
    console.log(
      [
        `  active tab audit: ${auditVerification.status}`,
        `artifact=${summary.artifactId}`,
        `checksum=${summary.checksum.slice(0, 12)}`,
        `packagePath=${summary.packagePath}`,
        `counts=missingSources=${counts.missingSourceCount},missingTests=${counts.missingTestCount},staleTests=${counts.staleTestCount},rejectedSkipped=${counts.rejectedSkippedTestCount},rejectedUnknown=${counts.rejectedUnknownTestCount},rejectedPublicRawReports=${counts.rejectedPublicRawReportCount},failingTests=${counts.failingTestCount}`,
      ].join(" "),
    )
  } else if (auditVerification?.reasonCode) {
    console.log(`  active tab audit: ${auditVerification.status} reason=${auditVerification.reasonCode}`)
  }
  if (manifest.requiredMissing.length > 0) {
    for (const id of manifest.requiredMissing) console.log(`  missing: ${id}`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const liveAcceptanceVerifier = options.liveAcceptancePublicKeyPath
    ? loadTrustedLiveAcceptanceVerifier(options.liveAcceptancePublicKeyPath)
    : null
  if (!existsSync(releaseModulePath)) {
    throw new Error(
      `Release module is missing. Build or sync core sidecars first: ${releaseModulePath}`,
    )
  }

  let performanceDatabase
  let rolloutDatabase
  try {
    const release = await import(releaseModulePath)
    const runtimePathsModule = await import(runtimePathsModulePath)
    const runtimePaths = runtimePathsModule.createRuntimePaths(RELEASE_PACKAGE_ENV.processEnv, {
      homeDir: rootDir,
      exists: existsSync,
    })
    let rolloutThresholdPolicySelection
    if (options.rolloutPolicyId !== null) {
      const repositoryModule = await import(rolloutPolicyRepositoryModulePath)
      rolloutDatabase = openReadOnlyDatabase(
        options.rolloutDatabasePath,
        "rollout_policy_database_open_failed",
      )
      rolloutThresholdPolicySelection = {
        selector: {
          policyId: options.rolloutPolicyId,
          policyVersion: options.rolloutPolicyVersion,
          releaseMode: options.rolloutPolicyMode,
        },
        repository: new repositoryModule.SqliteReleasePolicyAuthorizationRepository(
          rolloutDatabase,
        ),
      }
    }
    let livePerformanceAcceptanceSelection
    if (options.performanceSelection) {
      performanceDatabase = openReadOnlyDatabase(
        options.performanceSelection.databasePath,
        "performance_database_open_failed",
      )
      livePerformanceAcceptanceSelection = {
        selector: options.performanceSelection.selector,
        runs: options.performanceSelection.runs,
        repository: new SqlitePerformanceAcceptanceAuthorizationRepository(performanceDatabase),
        source: new SqliteLivePerformanceEvidenceSource(performanceDatabase),
      }
    }
    const targetPlatforms = options.targetPlatforms.length > 0 ? options.targetPlatforms : undefined
    const operationalRehearsalEvidence = options.runOperationalRehearsals
      ? runReleaseOperationalRehearsals({
          stageDir: options.npmStageDir,
          snapshotManifestPath: options.backupSnapshotManifestPath,
          platform: process.platform,
          arch: process.arch,
          nodeCommand: process.execPath,
          processEnv: RELEASE_PACKAGE_ENV.processEnv,
          issuedAt: Date.now(),
        })
      : undefined
    const outputDir = resolve(
      rootDir,
      options.outputDir ?? `release/${new Date().toISOString().replace(/[:.]/g, "-")}`,
    )
    const releaseNow = new Date()
    const manifestOptions = {
      rootDir,
      targetPlatforms,
      runtimePaths,
      now: releaseNow,
      ...(rolloutThresholdPolicySelection ? { rolloutThresholdPolicySelection } : {}),
      ...(livePerformanceAcceptanceSelection ? { livePerformanceAcceptanceSelection } : {}),
      ...(operationalRehearsalEvidence ? { operationalRehearsalEvidence } : {}),
    }
    const baselineManifest = release.buildReleaseManifest(manifestOptions)
    const liveAcceptanceBundle = options.liveAcceptanceBundlePath
      ? loadLiveAcceptanceBundle(
          options.liveAcceptanceBundlePath,
          {
            appVersion: baselineManifest.appVersion,
            gitTag: baselineManifest.gitTag,
            gitCommit: baselineManifest.gitCommit,
          },
          releaseNow.getTime(),
          liveAcceptanceVerifier?.verifySignature,
        )
      : null
    const previewManifest = liveAcceptanceBundle
      ? release.buildReleaseManifest({
          ...manifestOptions,
          liveAcceptanceEvidence: liveAcceptanceBundle.evidence,
        })
      : baselineManifest
    const readiness = release.evaluateReleaseReadiness(previewManifest)
    const readinessFailureSummary = release.buildReleaseReadinessFailureSummary({
      manifest: previewManifest,
      readiness,
    })
    const releaseApprovalEvidence = release.buildReleaseApprovalEvidenceProjection({
      manifest: previewManifest,
      readiness,
    })
    const activeTabInfoAuditAccessProjection =
      release.buildReleaseActiveTabInfoAuditAccessProjectionMatrix({
        manifest: previewManifest,
      })
    const activeTabInfoAuditVerificationPending = {
      status: "pending",
      visibility: "release_operator_summary",
      reasonCode: "active_tab_info_audit_artifact_payload_not_written",
      summary: {
        artifactId: releaseApprovalEvidence.activeTabInfoAuditArtifact.id,
        checksum: releaseApprovalEvidence.activeTabInfoAuditArtifact.checksum,
        packagePath: releaseApprovalEvidence.activeTabInfoAuditArtifact.packagePath,
        evidenceCountSummary: releaseApprovalEvidence.activeTabInfoEvidenceCompleteness,
      },
    }

    if (!options.dryRun && readiness.status === "blocked") {
      throw new Error(
        [
          `Release readiness blocked: ${readiness.blockerCodes.join(",")}`,
          ...readinessFailureSummary.lines,
        ].join("; "),
      )
    }

    if (!options.dryRun) {
      for (const step of filterPipelineSteps(previewManifest.pipeline.steps, options)) {
        runCommand(step.command)
      }
    }

    const result = options.dryRun
      ? {
          outputDir,
          manifestPath: join(outputDir, "manifest.json"),
          checksumPath: join(outputDir, "SHA256SUMS"),
          copiedArtifacts: [],
          activeTabInfoAuditVerification: activeTabInfoAuditVerificationPending,
          manifest: previewManifest,
        }
      : release.writePreparedReleasePackage({
          manifest: previewManifest,
          outputDir,
          copyPayload: options.copyPayload,
        })

    if (!options.dryRun && result.manifest.requiredMissing.length > 0) {
      throw new Error(
        `Required release artifacts are missing: ${result.manifest.requiredMissing.join(", ")}`,
      )
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            dryRun: options.dryRun,
            readiness,
            readinessFailureSummary,
            releaseApprovalEvidence,
            activeTabInfoAuditAccessProjection,
            ...result,
            manifest: result.manifest,
          },
          null,
          2,
        ),
      )
    } else {
      printHumanSummary(result, options.dryRun, readiness, readinessFailureSummary)
    }
  } finally {
    performanceDatabase?.close()
    rolloutDatabase?.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
