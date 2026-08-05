import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerStatusRoute } from "../packages/core/src/api/routes/status.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createUpdateRuntimeContext } from "../packages/core/src/update/service.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { initializeToolDispatcher } from "../packages/core/src/tools/index.js"
import type { RuntimePaths } from "../packages/core/src/config/paths.ts"
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

function useTempState(): string {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0340-state-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: JSON.stringify({
      webui: {
        host: "127.0.0.1",
        port: 18888,
      },
    }, null, 2),
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return runtimeFixture.paths.stateDir
}

function expectNoStatusPaths(value: unknown, paths: RuntimePaths): void {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(process.cwd())
  expect(serialized).not.toContain(paths.stateDir)
  expect(serialized).not.toContain(paths.configFile)
  expect(serialized).not.toContain(paths.dbFile)
  expect(serialized).not.toContain(paths.setupStateFile)
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

describe("task0340 status route path redaction", () => {
  it("masks runtime and status path fields", async () => {
    const app = Fastify({ logger: false })
    const config = runtimeFixture.config
    initializeToolDispatcher(config)
    installApiRuntimeConfig(app as never, config, runtimeFixture.paths)
    registerStatusRoute(app, {
      updateRuntime: createUpdateRuntimeContext(runtimeFixture.paths, {}),
    })
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/status" })

      expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
      const body = response.json()
      expect(body.runtime.cwd).toBe("[internal-path-redacted]")
      expect(body.paths).toEqual({
        stateDir: "[internal-path-redacted]",
        configFile: "[internal-path-redacted]",
        dbFile: "[internal-path-redacted]",
        setupStateFile: "[internal-path-redacted]",
      })
      expect(body.runtime.pid).toBe(process.pid)
      expect(body.runtime.platform).toBe(process.platform)
      expectNoStatusPaths(body, runtimeFixture.paths)
    } finally {
      await app.close()
    }
  })
})
