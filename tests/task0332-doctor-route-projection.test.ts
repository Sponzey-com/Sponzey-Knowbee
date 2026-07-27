import { createRequire } from "node:module"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerDoctorRoute } from "../packages/core/src/api/routes/doctor.ts"
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
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0332-state-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
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

describe("task0332 doctor route projection", () => {
  it("returns compact user-facing diagnostics without local paths", async () => {
    const stateDir = runtimeFixture.paths.stateDir
    const configFile = runtimeFixture.paths.configFile
    const dbFile = runtimeFixture.paths.dbFile
    const memoryDbFile = runtimeFixture.paths.memoryDbFile
    const cwd = process.cwd()

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerDoctorRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/doctor?mode=quick&write=1" })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.ok).toBe(true)
      expect(body.artifactPath).toBe("[internal-path-redacted]")
      expect(body.artifactId).toEqual(expect.stringMatching(/^doctor-.+\.json$/u))
      expect(existsSync(join(stateDir, "diagnostics", body.artifactId))).toBe(true)

      expect(body.report.summary).toBeTruthy()
      expect(Array.isArray(body.report.checks)).toBe(true)
      expect(body.report.manifest).toMatchObject({
        id: expect.any(String),
        app: { displayVersion: expect.any(String) },
        database: {
          currentVersion: expect.any(Number),
          latestVersion: expect.any(Number),
          upToDate: expect.any(Boolean),
        },
        promptSources: {
          count: expect.any(Number),
          localeParityOk: expect.any(Boolean),
        },
        provider: {
          provider: expect.any(String),
          model: expect.any(String),
          profileId: expect.any(String),
        },
      })
      expect(body.report.manifest.paths).toBeUndefined()
      expect(body.report.manifest.process).toBeUndefined()
      expect(body.report.manifest.memory).toBeUndefined()
      expect(body.report.manifest.app.workspaceRoot).toBeUndefined()
      expect(body.report.manifest.database.path).toBeUndefined()

      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain(stateDir)
      expect(serialized).not.toContain(configFile)
      expect(serialized).not.toContain(dbFile)
      expect(serialized).not.toContain(memoryDbFile)
      expect(serialized).not.toContain(cwd)
    } finally {
      await app.close()
    }
  })
})
