import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerConfigOperationsRoute } from "../packages/core/src/api/routes/config-operations.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number
    json(): any
  }>
}

const tempDirs: string[] = []
let runtimeFixture: ReturnType<typeof createTestRuntimeConfigFixture>

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function useTempState(): string {
  closeDb()
  const rootDir = makeTempDir("knowbee-task0326-state-")
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return runtimeFixture.paths.stateDir
}

function expectSnapshotRedacted(snapshot: any, forbiddenPaths: string[]): void {
  expect(snapshot.database.databasePath).toBe("[internal-path-redacted]")
  expect(snapshot.promptSources.workDir).toBe("[internal-path-redacted]")
  expect(snapshot.config.configPath).toBe("[internal-path-redacted]")
  if (snapshot.promptSources.versions.length > 0) {
    expect(snapshot.promptSources.versions.every((source: { path: string }) => source.path === "[internal-path-redacted]")).toBe(true)
    expect(snapshot.promptSources.versions.every((source: { checksum: string }) => source.checksum === "[checksum-redacted]")).toBe(true)
  }
  const serialized = JSON.stringify(snapshot)
  for (const path of forbiddenPaths) {
    expect(serialized).not.toContain(path)
  }
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0326 config operation snapshot redaction", () => {
  it("redacts direct configuration operation snapshots", async () => {
    const workDir = makeTempDir("knowbee-task0326-prompts-direct-")
    ensurePromptSourceFiles(workDir)
    mkdirSync(runtimeFixture.paths.stateDir, { recursive: true })
    writeFileSync(runtimeFixture.paths.configFile, "{ ai: { provider: 'local' } }\n", "utf-8")

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.load(), runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/config/operations?workDir=${encodeURIComponent(workDir)}`,
      })

      expect(response.statusCode).toBe(200)
      expectSnapshotRedacted(response.json().snapshot, [workDir, runtimeFixture.paths.stateDir, runtimeFixture.paths.configFile])
    } finally {
      await app.close()
    }
  })

  it("redacts snapshots attached to config operations", async () => {
    const workDir = makeTempDir("knowbee-task0326-prompts-attached-")
    ensurePromptSourceFiles(workDir)
    insertSession({
      id: "session-task0326",
      source: "webui",
      source_id: null,
      created_at: 1,
      updated_at: 1,
      summary: null,
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const dbBackup = await app.inject({ method: "POST", url: "/api/config/db/backup" })
      expect(dbBackup.statusCode).toBe(200)
      expectSnapshotRedacted(dbBackup.json().snapshot, [runtimeFixture.paths.stateDir])

      const promptExport = await app.inject({
        method: "POST",
        url: "/api/config/prompt-sources/export",
        payload: { workDir },
      })
      expect(promptExport.statusCode).toBe(200)
      expectSnapshotRedacted(promptExport.json().snapshot, [workDir, runtimeFixture.paths.stateDir])
    } finally {
      await app.close()
    }
  })

  it("redacts migration dry-run database path", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/config/migrations/dry-run" })

      expect(response.statusCode).toBe(200)
      expect(response.json().dryRun.status.databasePath).toBe("[internal-path-redacted]")
      expect(JSON.stringify(response.json())).not.toContain(runtimeFixture.paths.stateDir)
    } finally {
      await app.close()
    }
  })
})
