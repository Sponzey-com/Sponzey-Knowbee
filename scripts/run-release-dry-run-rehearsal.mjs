#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { createBackupSnapshot } from "../packages/core/src/config/backup-rehearsal.js"
import { createRuntimePaths } from "../packages/core/src/config/paths.js"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.js"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const packageScript = join(rootDir, "scripts", "package-npm.mjs")
const releaseScript = join(rootDir, "scripts", "release-package.mjs")
const runtimeEnvironment = Object.freeze({ ...process.env })
const reservedOptions = new Set([
  "--dry-run",
  "--run-operational-rehearsals",
  "--npm-stage-dir",
  "--backup-snapshot-manifest",
  "--npm-install-receipt",
  "--backup-restore-receipt",
])

function assertForwardedArguments(arguments_) {
  if (arguments_.some((argument) => reservedOptions.has(argument))) {
    throw new Error("operational_rehearsal_options_reserved")
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function readGitValue(arguments_) {
  try {
    const value = execFileSync("git", arguments_, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return value || null
  } catch {
    return null
  }
}

export function formatReleaseDryRunSummary(result) {
  const manifest = result.manifest
  const presentArtifacts = manifest.artifacts.filter(
    (artifact) => artifact.status === "present",
  ).length
  const cleanupSmoke = manifest.operationalRehearsalEvidence.artifactCleanupSmoke
  const cleanupSmokeStatus = cleanupSmoke?.status ?? "missing"
  const cleanupSmokeCheckCount = Array.isArray(cleanupSmoke?.checked)
    ? cleanupSmoke.checked.length
    : 0
  return [
    `Release dry-run: ${manifest.releaseVersion}`,
    `  readiness: ${result.readiness.status} (${result.readiness.blockerCodes.length} blockers)`,
    `  operational rehearsals: ${manifest.operationalRehearsalEvidence.status}`,
    `  artifact cleanup smoke: ${cleanupSmokeStatus} (${cleanupSmokeCheckCount} checks)`,
    `  artifacts: ${presentArtifacts} present, ${manifest.requiredMissing.length} required missing`,
    "",
  ].join("\n")
}

function run() {
  const forwardedArguments = process.argv.slice(2)
  assertForwardedArguments(forwardedArguments)
  const jsonRequested = forwardedArguments.includes("--json")

  const fixtureRoot = mkdtempSync(join(tmpdir(), "knowbee-release-rehearsal-"))
  try {
    const stateDir = join(fixtureRoot, "state")
    const workDir = join(fixtureRoot, "workspace")
    const stageDir = join(fixtureRoot, "npm-stage")
    const snapshotDir = join(fixtureRoot, "snapshot")
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: stateDir, KNOWBEE_CONFIG: join(stateDir, "config.json5") },
      { homeDir: fixtureRoot, exists: () => false },
    )
    const appVersion = String(readJson(join(rootDir, "package.json")).version ?? "0.1.0")
    const gitTag = readGitValue(["describe", "--tags", "--always", "--dirty"])
    const gitCommit = readGitValue(["rev-parse", "--short", "HEAD"])

    execFileSync(
      process.execPath,
      [packageScript, "--version", appVersion, "--output-dir", stageDir],
      {
        cwd: rootDir,
        env: runtimeEnvironment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    )

    getDb({ paths })
    writeFileSync(paths.configFile, "{}\n", "utf8")
    ensurePromptSourceFiles(workDir)
    const snapshot = createBackupSnapshot({
      paths,
      workDir,
      snapshotDir,
      appVersion,
      ...(gitTag ? { gitTag } : {}),
      ...(gitCommit ? { gitCommit } : {}),
      checkpointSqlite: false,
    })
    closeDb()

    const childEnvironment = Object.fromEntries(
      Object.entries(runtimeEnvironment).filter(
        ([key]) =>
          ![
            "KNOWBEE_CONFIG",
            "WIZBY_CONFIG",
            "HOWIE_CONFIG",
            "NODE_PATH",
            "NODE_OPTIONS",
            "TEST",
          ].includes(key) && !key.startsWith("VITEST"),
      ),
    )
    childEnvironment.KNOWBEE_STATE_DIR = paths.stateDir
    childEnvironment.KNOWBEE_LOG_LEVEL = runtimeEnvironment.KNOWBEE_LOG_LEVEL ?? "product"
    childEnvironment.NODE_ENV = "production"
    const result = spawnSync(
      process.execPath,
      [
        releaseScript,
        "--dry-run",
        ...(jsonRequested ? [] : ["--json"]),
        ...forwardedArguments,
        "--run-operational-rehearsals",
        "--npm-stage-dir",
        stageDir,
        "--backup-snapshot-manifest",
        join(snapshot.snapshotDir, "manifest.json"),
      ],
      {
        cwd: rootDir,
        encoding: "utf8",
        env: childEnvironment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    if (result.error) throw result.error
    process.stderr.write(result.stderr)
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      return
    }
    process.stdout.write(
      jsonRequested ? result.stdout : formatReleaseDryRunSummary(JSON.parse(result.stdout)),
    )
  } finally {
    closeDb()
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ""
if (import.meta.url === invokedPath) {
  try {
    run()
  } catch (error) {
    const reason =
      error instanceof Error && error.message === "operational_rehearsal_options_reserved"
        ? error.message
        : "release_operational_rehearsal_failed"
    process.stderr.write(`${reason}\n`)
    process.exitCode = 1
  }
}
