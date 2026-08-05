#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const cliEntry = resolve(repoRoot, "packages/cli/dist/index.js")
const destructiveFixture = process.argv.includes("--destructive-fixture")
const require = createRequire(import.meta.url)
const Database = require(resolve(repoRoot, "packages/core/node_modules/better-sqlite3"))

function fail(message) {
  console.error(message)
  process.exit(1)
}

function runKnowbee(args, env) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
  })
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout)
  } catch {
    fail(`${label} did not return JSON output.\n${stdout}`)
  }
}

function assertNoInternalCleanupDetails(serialized, label) {
  for (const forbidden of [
    "reasonCounts",
    "unsafe_symlink",
    "package_path_invalid",
    "private/release",
    "app.tar.gz",
  ]) {
    if (serialized.includes(forbidden)) fail(`${label} exposed internal cleanup detail: ${forbidden}`)
  }
}

function makeOld(path) {
  const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000)
  utimesSync(path, old, old)
}

function lstatOrNull(path) {
  try {
    return lstatSync(path)
  } catch {
    return null
  }
}

function createReleaseOutputFixture(root) {
  const outputDir = join(root, "release-output")
  const payloadDir = join(outputDir, "payload")
  mkdirSync(payloadDir, { recursive: true })
  const manifestPath = join(outputDir, "manifest.json")
  const checksumPath = join(outputDir, "SHA256SUMS")
  const whitelistedPayload = join(payloadDir, "app.tar.gz")
  const roguePayload = join(payloadDir, "rogue.txt")
  const symlinkPayload = join(payloadDir, "symlink")

  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      artifacts: [
        { packagePath: "app.tar.gz", status: "present" },
        { packagePath: "symlink", status: "present" },
      ],
    }, null, 2)}\n`,
    "utf8",
  )
  writeFileSync(checksumPath, "fixture  manifest.json\n", "utf8")
  writeFileSync(whitelistedPayload, "old whitelisted payload\n", "utf8")
  writeFileSync(roguePayload, "rogue payload must remain\n", "utf8")
  try {
    symlinkSync(whitelistedPayload, symlinkPayload)
  } catch {
    writeFileSync(symlinkPayload, "symlink unavailable fixture\n", "utf8")
  }
  for (const path of [manifestPath, checksumPath, whitelistedPayload, roguePayload]) makeOld(path)
  return { outputDir, manifestPath, checksumPath, whitelistedPayload, roguePayload, symlinkPayload }
}

function assertAuditLog(stateDir) {
  const dbPath = join(stateDir, "data.db")
  if (!existsSync(dbPath)) fail(`Audit database was not created: ${dbPath}`)
  const db = new Database(dbPath, { readonly: true })
  try {
    const row = db
      .prepare("SELECT params, output, result, approved_by FROM audit_logs WHERE tool_name = ? ORDER BY timestamp DESC LIMIT 1")
      .get("admin.artifact_cleanup")
    if (!row) fail("Cleanup audit log was not written.")
    if (row.result !== "succeeded") fail(`Cleanup audit result mismatch: ${row.result}`)
    if (row.approved_by !== "cli_confirmation") fail(`Cleanup audit approval mismatch: ${row.approved_by}`)
    const serialized = JSON.stringify(row)
    if (!serialized.includes("[explicit-release-output]")) {
      fail(`Cleanup audit did not redact release output path: ${serialized}`)
    }
    assertNoInternalCleanupDetails(serialized, "Cleanup audit")
  } finally {
    db.close()
  }
}

function runDestructiveFixtureSmoke(root, env) {
  const fixture = createReleaseOutputFixture(root)
  const command = runKnowbee(
    [
      "admin",
      "artifact-cleanup",
      "--execute",
      "--confirm",
      "CONFIRM ARTIFACT CLEANUP",
      "--release-output-dir",
      fixture.outputDir,
      "--max-age-ms",
      "1",
      "--json",
    ],
    env,
  )
  if (command.status !== 0) fail(`Destructive fixture cleanup failed.\n${command.stderr}`)
  const json = parseJson(command.stdout, "Destructive fixture cleanup")
  if (json.mode !== "execute" || json.ok !== true) {
    fail(`Destructive fixture cleanup did not succeed: ${command.stdout}`)
  }
  assertNoInternalCleanupDetails(`${command.stdout}\n${command.stderr}`, "Destructive fixture cleanup")
  for (const removed of [fixture.manifestPath, fixture.checksumPath, fixture.whitelistedPayload]) {
    if (existsSync(removed)) fail(`Cleanup did not remove expected fixture file: ${removed}`)
  }
  if (!existsSync(fixture.roguePayload)) fail("Cleanup removed rogue payload outside manifest whitelist.")
  const symlinkStat = lstatOrNull(fixture.symlinkPayload)
  if (!symlinkStat) fail("Cleanup removed symlink fixture.")
  if (!symlinkStat.isSymbolicLink()) {
    // Some filesystems do not allow symlinks; in that case this fixture is a regular fallback file.
    if (!existsSync(fixture.symlinkPayload)) fail("Symlink fallback fixture is missing.")
  }
  assertAuditLog(env.KNOWBEE_STATE_DIR)
}

if (!existsSync(cliEntry)) {
  fail("Build the CLI first: pnpm --filter @knowbee/cli build")
}

const stateDir = mkdtempSync(join(tmpdir(), "knowbee-artifact-cleanup-cli-smoke-"))
const env = {
  ...process.env,
  KNOWBEE_STATE_DIR: stateDir,
  KNOWBEE_NO_COLOR: "1",
}

try {
  const preview = runKnowbee(["admin", "artifact-cleanup", "--json"], env)
  if (preview.status !== 0) fail(`Preview failed.\n${preview.stderr}`)
  const previewJson = parseJson(preview.stdout, "Preview")
  if (previewJson.mode !== "preview") fail(`Preview mode mismatch: ${preview.stdout}`)
  if (previewJson.display?.kind !== "knowbee.artifact_cleanup.user_projection") {
    fail(`Preview did not return cleanup display projection: ${preview.stdout}`)
  }
  assertNoInternalCleanupDetails(JSON.stringify(previewJson), "Preview")

  const blocked = runKnowbee(
    ["admin", "artifact-cleanup", "--execute", "--confirm", "WRONG CONFIRMATION", "--json"],
    env,
  )
  if (blocked.status === 0) fail("Confirmation failure path unexpectedly succeeded.")
  const blockedJson = parseJson(blocked.stdout, "Confirmation failure")
  if (blockedJson.mode !== "execute" || blockedJson.ok !== false) {
    fail(`Confirmation failure output did not show blocked execution: ${blocked.stdout}`)
  }
  if (!blocked.stderr.includes("artifact_cleanup_confirmation_required")) {
    fail(`Confirmation failure did not report artifact_cleanup_confirmation_required.\n${blocked.stderr}`)
  }
  assertNoInternalCleanupDetails(`${blocked.stdout}\n${blocked.stderr}`, "Confirmation failure")

  if (destructiveFixture) runDestructiveFixtureSmoke(stateDir, env)

  // By default this smoke intentionally does not run destructive success cleanup.
  console.log(JSON.stringify({
    kind: "knowbee.artifact_cleanup_cli_smoke",
    status: "passed",
    checked: [
      "preview",
      "confirmation_failure",
      ...(destructiveFixture ? ["destructive_fixture_success"] : []),
    ],
  }, null, 2))
} finally {
  rmSync(stateDir, { recursive: true, force: true })
}
