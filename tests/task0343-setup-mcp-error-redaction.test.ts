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
  const dir = mkdtempSync(join(tmpdir(), "knowbee-task0343-mcp-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0343 setup MCP test error redaction", () => {
  it("does not expose command paths, cwd paths, or secret-like args in MCP test failures", async () => {
    const cwd = makeTempDir()
    const missingCommand = join(cwd, "missing-mcp-server")
    const secretArg = "token=task0343-mcp-secret-token"
    const runtimeFixture = createTestRuntimeConfigFixture({ rootDir: cwd })
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSetupRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/setup/test-mcp-server",
        payload: {
          server: {
            id: "task0343",
            name: secretArg,
            transport: "stdio",
            command: missingCommand,
            argsText: secretArg,
            cwd,
            url: "",
            required: false,
            enabled: true,
            status: "planned",
            tools: [],
          },
        },
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body).toMatchObject({ ok: false, tools: [] })
      expect(body.message).toEqual(expect.any(String))
      expect(body.message.length).toBeGreaterThan(0)
      expect(JSON.stringify(body)).not.toContain(cwd)
      expect(JSON.stringify(body)).not.toContain(missingCommand)
      expect(JSON.stringify(body)).not.toContain(secretArg)
      expect(JSON.stringify(body)).toContain("***")
    } finally {
      await app.close()
    }
  })
})
