#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import {
  runRestoreRehearsal,
  verifyBackupSnapshotManifest,
} from "../../packages/core/src/config/backup-rehearsal.js"
import {
  buildBackupRestoreRehearsalReceipt,
  verifyBackupRestoreRehearsalReceipt,
} from "../../packages/core/src/release/backup-restore-receipt.js"

function parseArguments(argv) {
  const options = { manifestPath: "", restoreDir: "", keepRestoreDir: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--manifest" || argument === "--restore-dir") {
      const value = argv[++index]
      if (!value || value.startsWith("--"))
        return { status: "rejected", reasonCode: "argument_value_required" }
      if (argument === "--manifest") options.manifestPath = value
      else options.restoreDir = value
    } else if (argument === "--keep-restore-dir") options.keepRestoreDir = true
    else if (argument === "--json") options.json = true
    else return { status: "rejected", reasonCode: "argument_unknown" }
  }
  if (!options.manifestPath.trim())
    return { status: "rejected", reasonCode: "manifest_path_required" }
  return { status: "ready", options }
}

function reject(reasonCode) {
  process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "rejected", reasonCode })}\n`)
  process.exitCode = 1
}

const parsed = parseArguments(process.argv.slice(2))
if (parsed.status === "rejected") {
  reject(parsed.reasonCode)
} else {
  let restoreDir = ""
  try {
    const manifestPath = resolve(parsed.options.manifestPath)
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    const verification = verifyBackupSnapshotManifest(manifest)
    if (!verification.ok) {
      reject("snapshot_checksum_failed")
    } else {
      if (parsed.options.restoreDir) {
        restoreDir = resolve(parsed.options.restoreDir)
        if (existsSync(restoreDir)) throw new Error("restore_dir_exists")
      } else {
        restoreDir = mkdtempSync(join(tmpdir(), "knowbee-backup-restore-rehearsal-"))
      }
      const report = runRestoreRehearsal({ manifest, restoreDir })
      const built = buildBackupRestoreRehearsalReceipt({
        manifest,
        snapshotVerification: verification,
        report,
        issuedAt: Date.now(),
      })
      if (built.status === "rejected") {
        reject(built.reasonCode)
      } else {
        const receiptVerification = verifyBackupRestoreRehearsalReceipt({
          receipt: built.receipt,
          manifest,
          snapshotVerification: verification,
        })
        if (receiptVerification.status === "rejected") {
          reject(receiptVerification.reasonCode)
        } else if (parsed.options.json) {
          process.stdout.write(`${JSON.stringify(built.receipt, null, 2)}\n`)
        } else {
          process.stdout.write(
            `Backup restore rehearsal: passed\n  snapshot: ${built.receipt.snapshot.id}\n  checks: ${built.receipt.restore.checkCount}\n`,
          )
        }
      }
    }
  } catch {
    if (process.exitCode !== 1) reject("backup_restore_rehearsal_failed")
  } finally {
    if (restoreDir && !parsed.options.keepRestoreDir) {
      rmSync(restoreDir, { recursive: true, force: true })
    }
  }
}
