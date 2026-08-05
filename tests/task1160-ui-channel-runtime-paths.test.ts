import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { registerChannelsRoute } from "../packages/core/src/api/routes/channels.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { registerUiModeRoute } from "../packages/core/src/api/routes/ui-mode.ts"
import { loadConfigSnapshot } from "../packages/core/src/config/index.js"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { writePersistedRawConfig, type PersistedConfigFileSystem } from "../packages/core/src/config/persisted-file.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const JSON5 = require("../packages/core/node_modules/json5") as { parse(source: string): unknown }
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

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

describe("task1160 UI mode and channel runtime paths", () => {
  it("persists UI and channel changes only to the immutable startup config", async () => {
    const startupStateDir = makeStateDir("knowbee-task1160-startup-")
    const changedStateDir = makeStateDir("knowbee-task1160-changed-")
    const startupPaths = createRuntimePaths({ KNOWBEE_STATE_DIR: startupStateDir })
    const changedPaths = createRuntimePaths({ KNOWBEE_STATE_DIR: changedStateDir })
    writeFileSync(startupPaths.configFile, JSON.stringify({
      marker: "startup",
      webui: { preferredUiMode: "beginner" },
      telegram: { enabled: true, botToken: "123456:task1160-startup-token", allowedUserIds: [1] },
    }), "utf-8")
    writeFileSync(changedPaths.configFile, JSON.stringify({
      marker: "changed",
      webui: { preferredUiMode: "beginner" },
      telegram: { enabled: true, botToken: "123456:task1160-changed-token", allowedUserIds: [2] },
    }), "utf-8")

    const runningConfig = loadConfigSnapshot({
      baseEnv: { KNOWBEE_STATE_DIR: startupStateDir },
      cwd: startupStateDir,
      paths: startupPaths,
    })
    initializeTestDbRuntime(startupStateDir)
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runningConfig, startupPaths)
    registerUiModeRoute(app)
    registerChannelsRoute(app)
    await app.ready()
    try {
      const mode = await app.inject({ method: "POST", url: "/api/ui/mode", payload: { mode: "advanced" } })
      const channel = await app.inject({ method: "POST", url: "/api/channels/telegram:primary/disable" })

      expect(mode.statusCode).toBe(200)
      expect(mode.json()).toMatchObject({ restartRequired: true, appliesOn: "next_start" })
      expect(channel.statusCode).toBe(200)
      const startupRaw = JSON5.parse(readFileSync(startupPaths.configFile, "utf-8")) as any
      const changedRaw = JSON5.parse(readFileSync(changedPaths.configFile, "utf-8")) as any
      expect(startupRaw).toMatchObject({ marker: "startup", webui: { preferredUiMode: "advanced" }, telegram: { enabled: false } })
      expect(changedRaw).toMatchObject({ marker: "changed", webui: { preferredUiMode: "beginner" }, telegram: { enabled: true } })
      expect(runningConfig.webui.preferredUiMode).toBe("beginner")
      expect(runningConfig.telegram?.enabled).toBe(true)
      expect(readdirSync(startupStateDir).some((name) => name.includes(".tmp-"))).toBe(false)
      expect(readdirSync(changedStateDir).some((name) => name.includes(".tmp-"))).toBe(false)
    } finally {
      await app.close()
    }
  })

  it("keeps UI and channel persistence modules free of dynamic PATHS access", () => {
    const mode = readFileSync("packages/core/src/ui/mode.ts", "utf-8")
    const channels = readFileSync("packages/core/src/api/routes/channels.ts", "utf-8")
    const persistence = readFileSync("packages/core/src/config/persisted-file.ts", "utf-8")

    expect(mode).not.toMatch(/import .*[,{ ]PATHS[, }]/u)
    expect(channels).not.toMatch(/import .*[,{ ]PATHS[, }]/u)
    expect(`${mode}\n${channels}\n${persistence}`).not.toContain("process.env")
    expect(channels).toContain("const paths = getApiRuntimePaths(req)")
    expect(persistence).toContain("fileSystem.rename(tempPath, targetPath)")
  })

  it("preserves the existing config and removes staging data when atomic rename fails", () => {
    const paths = createRuntimePaths({ KNOWBEE_STATE_DIR: "/virtual/task1160" })
    const files = new Map<string, string>([[paths.configFile, "original-config"]])
    const fileSystem: PersistedConfigFileSystem = {
      exists: (path) => files.has(path),
      makeDirectory: () => {},
      readText: (path) => files.get(path) ?? "",
      writeText: (path, content) => { files.set(path, content) },
      rename: () => { throw new Error("rename failed") },
      remove: (path) => { files.delete(path) },
    }

    expect(() => writePersistedRawConfig({ marker: "replacement" }, paths, fileSystem)).toThrow("rename failed")
    expect(files.get(paths.configFile)).toBe("original-config")
    expect([...files.keys()].some((path) => path.includes(".tmp-"))).toBe(false)
  })
})
