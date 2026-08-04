import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Task 179 backup restore audit command", () => {
  it("creates and removes a private fixture while returning only a bounded receipt", () => {
    const command = spawnSync(process.execPath, ["scripts/self/run-backup-restore-audit.mjs"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: { ...process.env, TASK179_SECRET_CANARY: "SECRET_TASK179" },
    })

    expect(command.status, command.stderr).toBe(0)
    expect(JSON.parse(command.stdout)).toMatchObject({
      kind: "knowbee.release.backup_restore_rehearsal_receipt",
      schemaVersion: 1,
      status: "passed",
      snapshot: { appVersion: "rehearsal" },
      restore: {
        checkCount: 5,
        migration: { upToDate: true },
      },
    })
    expect(command.stdout).not.toMatch(/SECRET_TASK179|snapshotPath|restoredDir|\/tmp\//u)
  }, 120_000)

  it("keeps environment lookup and restore policy out of the composition wrapper", () => {
    const source = readFileSync("scripts/self/run-backup-restore-audit.mjs", "utf8")

    expect(source).not.toMatch(/process\.env|verifyBackupSnapshotManifest|runRestoreRehearsal/u)
    expect(source).toContain("audit-backup-restore-rehearsal.mjs")
    expect(source).toContain("[auditScript, ...forwarded]")
  })
})
