#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createBackupSnapshot } from "../packages/core/src/config/backup-rehearsal.js"
import { createRuntimePaths } from "../packages/core/src/config/paths.js"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.js"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const auditScript = join(rootDir, "scripts", "audit-backup-restore-rehearsal.mjs")
const args = process.argv.slice(2)
let fixtureRoot = ""

try {
  let forwarded = args
  if (args.length === 0) {
    fixtureRoot = mkdtempSync(join(tmpdir(), "knowbee-backup-audit-"))
    const stateRoot = join(fixtureRoot, "state-root")
    const workDir = join(fixtureRoot, "workspace")
    const snapshotDir = join(fixtureRoot, "snapshot")
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: stateRoot },
      { homeDir: fixtureRoot, exists: () => false },
    )
    getDb({ paths })
    ensurePromptSourceFiles(workDir)
    const manifest = createBackupSnapshot({
      paths,
      workDir,
      snapshotDir,
      appVersion: "rehearsal",
      checkpointSqlite: false,
    })
    closeDb()
    forwarded = ["--manifest", join(manifest.snapshotDir, "manifest.json"), "--json"]
  }
  const output = execFileSync(process.execPath, [auditScript, ...forwarded], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  process.stdout.write(output)
} catch {
  process.stderr.write(
    `${JSON.stringify({ schemaVersion: 1, status: "rejected", reasonCode: "backup_restore_audit_failed" })}\n`,
  )
  process.exitCode = 1
} finally {
  closeDb()
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true })
}
