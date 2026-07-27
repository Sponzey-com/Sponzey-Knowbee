import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerSettingsRoute } from "../packages/core/src/api/routes/settings.js"
import { registerSetupRoute } from "../packages/core/src/api/routes/setup.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
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
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0337-state-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: JSON.stringify({
      telegram: { enabled: true, botToken: "123456:task0337-token" },
      webui: { auth: { enabled: true, token: "task0337-auth-token" } },
      scheduler: { enabled: true },
    }, null, 2),
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function expectNoSetupPaths(value: unknown, stateDir: string): void {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(stateDir)
  expect(serialized).not.toContain(runtimeFixture.paths.configFile)
  expect(serialized).not.toContain(runtimeFixture.paths.setupStateFile)
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

describe("task0337 setup check path redaction", () => {
  it("masks setup check paths in setup and settings route responses", async () => {
    const stateDir = runtimeFixture.paths.stateDir
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSetupRoute(app)
    registerSettingsRoute(app)
    await app.ready()
    try {
      const setupChecks = await app.inject({ method: "GET", url: "/api/setup/checks" })
      expect(setupChecks.statusCode).toBe(200)
      expect(setupChecks.json()).toMatchObject({
        stateDir: "[internal-path-redacted]",
        configFile: "[internal-path-redacted]",
        setupStateFile: "[internal-path-redacted]",
        telegramConfigured: true,
        authEnabled: true,
        schedulerEnabled: true,
      })
      expectNoSetupPaths(setupChecks.json(), stateDir)

      const settings = await app.inject({ method: "GET", url: "/api/settings" })
      expect(settings.statusCode).toBe(200)
      expect(settings.json().checks).toMatchObject({
        stateDir: "[internal-path-redacted]",
        configFile: "[internal-path-redacted]",
        setupStateFile: "[internal-path-redacted]",
      })
      expectNoSetupPaths(settings.json().checks, stateDir)
    } finally {
      await app.close()
    }
  })
})
