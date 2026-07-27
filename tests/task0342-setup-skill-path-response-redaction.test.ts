import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { registerSetupRoute } from "../packages/core/src/api/routes/setup.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

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

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "knowbee-task0342-skill-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0342 setup skill path response redaction", () => {
  it("does not expose resolved local paths from skill path validation responses", async () => {
    const existingPath = makeTempDir()
    const missingPath = join(existingPath, "missing-skill")
    const runtimeFixture = createTestRuntimeConfigFixture({ rootDir: existingPath })
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSetupRoute(app)
    await app.ready()
    try {
      const success = await app.inject({
        method: "POST",
        url: "/api/setup/test-skill-path",
        payload: { path: existingPath },
      })
      expect(success.statusCode).toBe(200)
      expect(success.json()).toMatchObject({ ok: true })
      expect(success.json().message).toEqual(expect.any(String))
      expect(success.json().message.length).toBeGreaterThan(0)
      expect(success.json().resolvedPath).toBeUndefined()
      expect(JSON.stringify(success.json())).not.toContain(existingPath)

      const failure = await app.inject({
        method: "POST",
        url: "/api/setup/test-skill-path",
        payload: { path: missingPath },
      })
      expect(failure.statusCode).toBe(400)
      expect(failure.json()).toMatchObject({ ok: false })
      expect(failure.json().message).toEqual(expect.any(String))
      expect(failure.json().message.length).toBeGreaterThan(0)
      expect(failure.json().resolvedPath).toBeUndefined()
      expect(JSON.stringify(failure.json())).not.toContain(existingPath)
      expect(JSON.stringify(failure.json())).not.toContain(missingPath)
    } finally {
      await app.close()
    }
  })
})
