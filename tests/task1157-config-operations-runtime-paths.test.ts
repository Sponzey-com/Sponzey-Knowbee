import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import {
  exportMaskedConfig,
  resolveDatabaseBackupPath,
} from "../packages/core/src/config/operations.ts"
import {
  getFailedConfigurationOperationSnapshot,
  runDatabaseImportConfigurationOperation,
} from "../packages/core/src/config/operation-command.ts"
import { closeDb, getDb } from "../packages/core/src/db/index.js"

const tempDirs: string[] = []

function makeStateDir(prefix: string): string {
  const stateDir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(stateDir)
  return stateDir
}

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task1157 configuration operation runtime paths", () => {
  it("exports only from immutable startup paths after process environment changes", () => {
    const startupStateDir = makeStateDir("knowbee-task1157-startup-")
    const changedStateDir = makeStateDir("knowbee-task1157-changed-")
    const paths = createRuntimePaths({ KNOWBEE_STATE_DIR: startupStateDir })
    const startupSecret = "sk-task1157-startup-secret"
    const changedSecret = "sk-task1157-changed-secret"
    const changedConfigFile = join(changedStateDir, "config.json5")

    writeFileSync(paths.configFile, JSON.stringify({ ai: { connection: { auth: { apiKey: startupSecret } } } }), "utf-8")
    writeFileSync(changedConfigFile, JSON.stringify({ ai: { connection: { auth: { apiKey: changedSecret } } } }), "utf-8")

    const result = exportMaskedConfig(paths)
    const exported = readFileSync(result.exportPath, "utf-8")

    expect(result.configPath).toBe(paths.configFile)
    expect(result.exportPath.startsWith(join(startupStateDir, "backups", "config"))).toBe(true)
    expect(existsSync(join(changedStateDir, "backups"))).toBe(false)
    expect(exported).not.toContain(startupSecret)
    expect(exported).not.toContain(changedSecret)
  })

  it("keeps PATHS and process environment access outside operation and API route modules", () => {
    const operations = readFileSync("packages/core/src/config/operations.ts", "utf-8")
    const backupRehearsal = readFileSync("packages/core/src/config/backup-rehearsal.ts", "utf-8")
    const route = readFileSync("packages/core/src/api/routes/config-operations.ts", "utf-8")
    const cliConfig = readFileSync("packages/cli/src/commands/config.ts", "utf-8")

    expect(operations).not.toContain("import { PATHS }")
    expect(operations).not.toContain("process.env")
    expect(route).not.toContain("PATHS")
    expect(route).toContain("const paths = getApiRuntimePaths(req)")
    expect(backupRehearsal).not.toContain("PATHS")
    expect(backupRehearsal).not.toContain("process.env")
    expect(cliConfig).not.toContain("PATHS")
    expect(cliConfig).toContain("paths: Pick<RuntimePaths, \"configFile\">")
  })

  it("restores the original database when an imported backup fails validation", () => {
    const stateDir = makeStateDir("knowbee-task1157-rollback-")
    const paths = createRuntimePaths({ KNOWBEE_STATE_DIR: stateDir })
    const db = getDb({ paths })
    db.exec("CREATE TABLE IF NOT EXISTS task1157_marker (value TEXT NOT NULL)")
    db.prepare("INSERT INTO task1157_marker (value) VALUES (?)").run("preserved")
    const invalidBackup = join(stateDir, "invalid.sqlite3")
    writeFileSync(invalidBackup, "not-a-sqlite-database", "utf-8")

    let failure: unknown
    try {
      runDatabaseImportConfigurationOperation({
        paths,
        resolveBackupPath: () => invalidBackup,
        logger: { product: () => {}, fieldDebug: () => {}, development: () => {} },
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toMatch(/rollback/u)
    expect(getFailedConfigurationOperationSnapshot(failure)?.transitions.map((transition) => transition.to)).toEqual([
      "received",
      "validated",
      "backed_up",
      "replacing",
      "verifying",
      "rolling_back",
      "failed",
    ])
    expect(getFailedConfigurationOperationSnapshot(failure)?.transitions.at(-1)?.reasonCode).toBe("database_import_rolled_back")
    const restored = getDb({ paths }).prepare<[], { value: string }>("SELECT value FROM task1157_marker").get()

    expect(restored?.value).toBe("preserved")
    expect(readdirSync(stateDir).some((name) => name.startsWith("data.db.tmp-"))).toBe(false)
  })

  it.skipIf(process.platform === "win32")("rejects backup ids whose symlink target escapes the backup root", () => {
    const stateDir = makeStateDir("knowbee-task1157-symlink-")
    const paths = createRuntimePaths({ KNOWBEE_STATE_DIR: stateDir })
    const backupDir = join(stateDir, "backups", "db")
    const outsideFile = join(stateDir, "outside.sqlite3")
    const backupId = "db-backup-symlink"
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(outsideFile, "outside", "utf-8")
    symlinkSync(outsideFile, join(backupDir, `${backupId}.sqlite3`))

    expect(() => resolveDatabaseBackupPath(backupId, paths)).toThrow(/outside backup root/u)
  })
})
