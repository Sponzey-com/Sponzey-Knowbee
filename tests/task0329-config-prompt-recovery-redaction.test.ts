import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerConfigOperationsRoute } from "../packages/core/src/api/routes/config-operations.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { createTestRuntimeConfigFixture, type TestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
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

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function useTempState(): string {
  closeDb()
  const rootDir = makeTempDir("knowbee-task0329-state-")
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return runtimeFixture.paths.stateDir
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

describe("task0329 config prompt source recovery redaction", () => {
  it("redacts recovery prompt directory and registry file metadata", async () => {
    const workDir = makeTempDir("knowbee-task0329-work-")
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/config/prompt-sources/recover",
        payload: { workDir },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.recovery.promptsDir).toBe("[internal-path-redacted]")
      expect(body.recovery.created.length).toBeGreaterThan(0)
      expect(Array.isArray(body.recovery.existing)).toBe(true)
      expect(body.recovery.registry.length).toBeGreaterThan(0)
      expect(body.recovery.registry.every((source: { path: string }) => source.path === "[internal-path-redacted]")).toBe(true)
      expect(body.recovery.registry.every((source: { checksum: string }) => source.checksum === "[checksum-redacted]")).toBe(true)
      expect(body.recovery.registry.some((source: { sourceId: string }) => source.sourceId === "identity")).toBe(true)
      expect(JSON.stringify(body.recovery)).not.toContain(workDir)
    } finally {
      await app.close()
    }
  })
})
