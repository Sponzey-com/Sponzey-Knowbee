import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.js"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { mcpRegistry } from "../packages/core/src/mcp/registry.js"

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
  const dir = mkdtempSync(join(tmpdir(), "knowbee-task0346-mcp-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await mcpRegistry.closeAll()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0346 MCP status API redaction", () => {
  it("masks command and runtime error paths in MCP status responses", async () => {
    const cwd = makeTempDir()
    const missingCommand = join(cwd, "missing-status-mcp")
    await mcpRegistry.loadFromConfig({
      ...DEFAULT_CONFIG,
      mcp: {
        servers: {
          task0346: {
            command: missingCommand,
            cwd,
            startupTimeoutSec: 1,
            toolTimeoutSec: 1,
            required: true,
          },
        },
      },
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, DEFAULT_CONFIG)
    registerMcpRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/mcp/servers" })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.summary).toMatchObject({ serverCount: 1, readyCount: 0, requiredFailures: 1 })
      expect(body.servers).toHaveLength(1)
      expect(body.servers[0]).toMatchObject({
        name: "task0346",
        ready: false,
        required: true,
      })
      const serialized = JSON.stringify(body)
      expect(serialized).toContain("[internal-path-redacted]")
      expect(serialized).not.toContain(missingCommand)
      expect(serialized).not.toContain(cwd)
    } finally {
      await app.close()
    }
  })

  it("passes the immutable API startup config to MCP reload", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, DEFAULT_CONFIG)
    const reload = vi.spyOn(mcpRegistry, "reloadFromConfig").mockResolvedValue([])
    registerMcpRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "POST", url: "/api/mcp/reload" })
      expect(response.statusCode).toBe(200)
      expect(reload).toHaveBeenCalledWith(DEFAULT_CONFIG)
      expect(response.json()).toMatchObject({
        runtimeConfigSource: "startup_snapshot",
        runtimeConfigApplied: true,
        configCommand: { kind: "mcp.reload", state: "completed" },
      })
    } finally {
      await app.close()
      reload.mockRestore()
    }
  })

  it("reports MCP runtime application failure without exposing the raw error", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, DEFAULT_CONFIG)
    const reload = vi
      .spyOn(mcpRegistry, "reloadFromConfig")
      .mockRejectedValue(new Error("token=secret /private/runtime/path"))
    registerMcpRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "POST", url: "/api/mcp/reload" })
      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body).toMatchObject({
        error: "mcp_runtime_reload_failed",
        runtimeConfigSource: "startup_snapshot",
        runtimeConfigApplied: false,
        configCommand: { kind: "mcp.reload", state: "completed" },
      })
      expect(JSON.stringify(body)).not.toContain("token=secret")
      expect(JSON.stringify(body)).not.toContain("/private/runtime/path")
    } finally {
      await app.close()
      reload.mockRestore()
    }
  })
})
