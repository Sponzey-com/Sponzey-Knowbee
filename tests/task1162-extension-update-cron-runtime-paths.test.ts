import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
import {
  createExtensionGovernanceStorage,
  createExtensionRollbackPoint,
  rollbackExtensionToPoint,
} from "../packages/core/src/security/extension-governance.ts"
import {
  buildManagedSystemCronEntry,
  reconcileSystemCronSchedule,
  type SystemCronProcessAdapter,
} from "../packages/core/src/scheduler/system-cron.ts"
import type { DbSchedule } from "../packages/core/src/db/index.ts"
import {
  createUpdateRuntimeContext,
  checkForUpdates,
  getUpdateSnapshot,
} from "../packages/core/src/update/service.ts"
import type { PersistedConfigFileSystem } from "../packages/core/src/config/persisted-file.ts"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const tempDirs: string[] = []

function makeTempDir(label: string): string {
  const path = join(tmpdir(), `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(path, { recursive: true })
  tempDirs.push(path)
  return path
}

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) rmSync(path, { recursive: true, force: true })
  }
})

describe("task1162 extension, update, and cron runtime paths", () => {
  it("restores only the startup extension rollback point after environment changes", () => {
    const startupState = makeTempDir("knowbee-extension-startup")
    const changedState = makeTempDir("knowbee-extension-changed")
    const startupStorage = createExtensionGovernanceStorage(
      createRuntimePaths({ KNOWBEE_STATE_DIR: startupState }),
    )
    const changedStorage = createExtensionGovernanceStorage(
      createRuntimePaths({ KNOWBEE_STATE_DIR: changedState }),
    )
    mkdirSync(changedStorage.rollbackDir, { recursive: true })
    const changedRollbackPath = join(changedStorage.rollbackDir, "plugin_runtime-path.json")
    writeFileSync(changedRollbackPath, "changed-storage-sentinel", "utf8")
    const sourcePath = join(startupState, "plugin.js")
    writeFileSync(sourcePath, "startup-v1", "utf8")
    createExtensionRollbackPoint({
      extensionId: "plugin:runtime-path",
      sourcePath,
      storage: startupStorage,
    })
    writeFileSync(sourcePath, "startup-v2", "utf8")

    rollbackExtensionToPoint("plugin:runtime-path", startupStorage)

    expect(readFileSync(sourcePath, "utf8")).toBe("startup-v1")
    expect(readFileSync(join(startupStorage.rollbackDir, "plugin_runtime-path.json"), "utf8"))
      .toContain("plugin:runtime-path")
    expect(readFileSync(changedRollbackPath, "utf8")).toBe("changed-storage-sentinel")

    writeFileSync(
      join(startupStorage.rollbackDir, "plugin_runtime-path.json"),
      "{corrupt",
      "utf8",
    )
    writeFileSync(sourcePath, "preserve-after-corruption", "utf8")
    expect(() => rollbackExtensionToPoint("plugin:runtime-path", startupStorage)).toThrow()
    expect(readFileSync(sourcePath, "utf8")).toBe("preserve-after-corruption")
  })

  it("reads update state and repository only from the startup context", () => {
    const startupState = makeTempDir("knowbee-update-startup")
    const changedState = makeTempDir("knowbee-update-changed")
    const startupContext = createUpdateRuntimeContext(
      createRuntimePaths({ KNOWBEE_STATE_DIR: startupState }),
      { KNOWBEE_UPDATE_REPOSITORY: "https://github.com/example/startup.git" },
    )
    const changedContext = createUpdateRuntimeContext(
      createRuntimePaths({ KNOWBEE_STATE_DIR: changedState }),
      { KNOWBEE_UPDATE_REPOSITORY: "https://github.com/example/changed.git" },
    )
    for (const [context, message] of [[startupContext, "startup"], [changedContext, "changed"]] as const) {
      mkdirSync(dirname(context.stateFilePath), { recursive: true })
      writeFileSync(context.stateFilePath, JSON.stringify({ status: "latest", message }), "utf8")
    }

    const snapshot = getUpdateSnapshot(startupContext)

    expect(snapshot.message).toBe("startup")
    expect(getUpdateSnapshot(startupContext, { repositoryUrl: null }).repositoryUrl)
      .not.toBe(changedContext.repositoryUrl)

    writeFileSync(startupContext.stateFilePath, "{corrupt", "utf8")
    expect(getUpdateSnapshot(startupContext).message).not.toBe("changed")
  })

  it("builds cron commands with startup state and log paths only", () => {
    const startupState = "/opt/Knowbee Startup"
    const changedState = "/opt/Knowbee Changed"
    const schedule = {
      id: "schedule-runtime-path",
      cron_expression: "5 * * * *",
    } as DbSchedule

    const entry = buildManagedSystemCronEntry(schedule, {
      stateDir: startupState,
      logsDir: join(startupState, "logs"),
    }).join("\n")

    expect(entry).toContain("KNOWBEE_STATE_DIR='/opt/Knowbee Startup'")
    expect(entry).toContain("/opt/Knowbee Startup/logs/schedule-system-cron.log")
    expect(entry).not.toContain(changedState)
  })

  it("preserves existing rollback and update files when atomic rename fails", async () => {
    const stateDir = makeTempDir("knowbee-atomic-persistence")
    const files = new Map<string, string>()
    const removed: string[] = []
    const fileSystem: PersistedConfigFileSystem = {
      exists: (path) => files.has(path),
      makeDirectory: () => undefined,
      readText: (path) => {
        const value = files.get(path)
        if (value === undefined) throw new Error(`missing:${path}`)
        return value
      },
      writeText: (path, content) => { files.set(path, content) },
      rename: () => { throw new Error("injected rename failure") },
      remove: (path) => {
        removed.push(path)
        files.delete(path)
      },
    }
    const paths = createRuntimePaths({ KNOWBEE_STATE_DIR: stateDir })
    const extensionStorage = createExtensionGovernanceStorage(paths, fileSystem)
    const updateContext = createUpdateRuntimeContext(paths, {}, fileSystem)
    const rollbackPath = join(extensionStorage.rollbackDir, "plugin_atomic.json")
    files.set(rollbackPath, "existing-rollback")
    files.set(updateContext.stateFilePath, "existing-update")
    const sourcePath = join(stateDir, "plugin.js")
    writeFileSync(sourcePath, "plugin-content", "utf8")

    expect(() => createExtensionRollbackPoint({
      extensionId: "plugin:atomic",
      sourcePath,
      storage: extensionStorage,
    })).toThrow("injected rename failure")
    await expect(checkForUpdates(updateContext, { repositoryUrl: "invalid-repository" }))
      .rejects.toThrow("injected rename failure")

    expect(files.get(rollbackPath)).toBe("existing-rollback")
    expect(files.get(updateContext.stateFilePath)).toBe("existing-update")
    expect([...files.keys()].filter((path) => path.includes(".tmp-"))).toEqual([])
    expect(removed.filter((path) => path.includes(".tmp-"))).toHaveLength(2)
  })

  it("surfaces process adapter failures without installing a partial cron entry", () => {
    let spawnCount = 0
    const processAdapter: SystemCronProcessAdapter = {
      platform: "darwin",
      execPath: "/usr/bin/node",
      exists: () => true,
      spawn: () => {
        spawnCount += 1
        if (spawnCount === 1) {
          return { status: 0, stdout: "", stderr: "" }
        }
        return {
          error: new Error("injected crontab read failure"),
          status: null,
          stdout: "",
          stderr: "",
        }
      },
    }
    const schedule = {
      id: "schedule-process-failure",
      enabled: 1,
      cron_expression: "5 * * * *",
    } as DbSchedule

    expect(() => reconcileSystemCronSchedule(schedule, {
      stateDir: "/startup/state",
      logsDir: "/startup/state/logs",
    }, processAdapter)).toThrow("injected crontab read failure")
    expect(spawnCount).toBe(2)
  })

  it("forbids dynamic path and environment reads in persistence boundaries", () => {
    const files = [
      "packages/core/src/security/extension-governance.ts",
      "packages/core/src/update/service.ts",
      "packages/core/src/scheduler/system-cron.ts",
    ]
    for (const relativePath of files) {
      const source = readFileSync(join(repoRoot, relativePath), "utf8")
      expect(source, relativePath).not.toMatch(/\bPATHS\b/)
      expect(source, relativePath).not.toContain("process.env")
      expect(source, relativePath).not.toContain("captureRuntimePaths")
    }
  })
})
