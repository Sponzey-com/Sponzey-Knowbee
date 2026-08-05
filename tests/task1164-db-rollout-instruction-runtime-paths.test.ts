import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import {
  DbRuntimeInitializationError,
  DbRuntimeNotInitializedError,
  DbRuntimePathMismatchError,
  closeDb,
  createDbRuntimeContext,
  getDb,
  getDbRuntimeState,
  initializeDbRuntime,
} from "../packages/core/src/db/index.js"
import { discoverInstructionChain } from "../packages/core/src/instructions/discovery.ts"
import {
  buildRolloutSafetySnapshot,
  setFeatureFlagMode,
} from "../packages/core/src/runtime/rollout-safety.ts"

const tempDirs: string[] = []
const require = createRequire(import.meta.url)
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as new (
  path: string,
) => { open: boolean; close(): void; pragma(source: string): unknown }

function tempPaths(name: string) {
  const root = mkdtempSync(join(tmpdir(), `knowbee-task1164-${name}-`))
  tempDirs.push(root)
  return createRuntimePaths(
    { KNOWBEE_STATE_DIR: join(root, "state") },
    { homeDir: root, exists: () => false },
  )
}

afterEach(() => {
  closeDb()
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("task1164 rollout and instruction runtime paths", () => {
  it("rejects helper access before an explicit DB runtime is installed", () => {
    expect(() => getDb()).toThrow(DbRuntimeNotInitializedError)
    expect(getDbRuntimeState()).toBe("uninitialized")
  })

  it("rejects a changed instance path after startup initialization", () => {
    const startup = tempPaths("db-startup")
    const changed = tempPaths("db-changed")
    getDb({ paths: startup })

    expect(() => getDb({ paths: changed })).toThrow(DbRuntimePathMismatchError)
    expect(getDbRuntimeState()).toBe("ready")
  })

  it("keeps DB initialization failure terminal without opening another path", () => {
    const startup = tempPaths("db-failure-startup")
    const changed = tempPaths("db-failure-changed")
    const openedPaths: string[] = []
    const dependencies = {
      exists: () => false,
      makeDirectory: () => {},
      openDatabase: (path: string) => {
        openedPaths.push(path)
        throw new Error("open failed")
      },
      createBackup: () => null,
      migrate: () => {},
      reconcile: () => {},
    }

    expect(() => initializeDbRuntime(createDbRuntimeContext({
      paths: startup,
      migrationOwnerId: "test:task1164",
      dependencies,
    }))).toThrow(DbRuntimeInitializationError)
    expect(() => getDb({ paths: changed })).toThrow(DbRuntimeInitializationError)
    expect(openedPaths).toEqual([startup.dbFile])
    expect(getDbRuntimeState()).toBe("failed")
  })

  for (const stage of ["configuring", "backup_check", "migrating", "reconciling"] as const) {
    it(`closes the unpublished DB when ${stage} fails`, () => {
      const paths = tempPaths(`db-${stage}`)
      const opened = new BetterSqlite3(":memory:")
      const dependencies = {
        exists: () => stage === "backup_check",
        makeDirectory: () => {},
        openDatabase: () => {
          if (stage === "configuring") {
            return {
              pragma: () => { throw new Error("pragma failed") },
              close: () => opened.close(),
            } as never
          }
          return opened as never
        },
        createBackup: () => {
          if (stage === "backup_check") throw new Error("backup failed")
          return null
        },
        migrate: () => {
          if (stage === "migrating") throw new Error("migration failed")
        },
        reconcile: () => {
          if (stage === "reconciling") throw new Error("reconcile failed")
        },
      }

      expect(() => initializeDbRuntime(createDbRuntimeContext({
        paths,
        migrationOwnerId: "test:task1164",
        dependencies,
      }))).toThrow(DbRuntimeInitializationError)
      expect(opened.open).toBe(false)
      expect(getDbRuntimeState()).toBe("failed")
    })
  }

  it("reads rollout state only from the explicitly selected startup DB", () => {
    const startup = tempPaths("rollout-startup")
    const changed = tempPaths("rollout-changed")

    getDb({ paths: startup })
    setFeatureFlagMode({ featureKey: "message_ledger", mode: "enforced" })
    closeDb()
    getDb({ paths: changed })
    setFeatureFlagMode({ featureKey: "message_ledger", mode: "off" })
    closeDb()

    const snapshot = buildRolloutSafetySnapshot(startup.dbFile)
    expect(snapshot.featureFlags.find((flag) => flag.featureKey === "message_ledger"))
      .toMatchObject({ mode: "enforced", source: "db" })
  })

  it("discovers global instructions only from the explicit startup state root", () => {
    const startup = tempPaths("instructions-startup")
    const changed = tempPaths("instructions-changed")
    const workDir = join(startup.stateDir, "project")
    mkdirSync(workDir, { recursive: true })
    mkdirSync(changed.stateDir, { recursive: true })
    writeFileSync(join(startup.stateDir, "AGENTS.md"), "startup global instruction")
    writeFileSync(join(changed.stateDir, "AGENTS.md"), "changed global instruction")

    const chain = discoverInstructionChain({
      workDir,
      globalStateDir: startup.stateDir,
      fallbackBoundaryDir: startup.stateDir,
    })
    expect(chain.sources.map((source) => source.content)).toContain("startup global instruction")
    expect(chain.sources.map((source) => source.content)).not.toContain("changed global instruction")
  })

  it("forbids implicit dynamic paths in rollout and instruction discovery", () => {
    for (const file of [
      "packages/core/src/db/index.ts",
      "packages/core/src/runtime/rollout-safety.ts",
      "packages/core/src/instructions/discovery.ts",
    ]) {
      const source = readFileSync(file, "utf-8")
      expect(source, file).not.toMatch(/\bPATHS\b/)
      expect(source, file).not.toMatch(/process\.env/)
      expect(source, file).not.toMatch(/process\.cwd\(\)/)
    }
  })
})
