import { createRequire } from "node:module"
import { afterEach, describe, expect, it, vi } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.js"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { redactMcpLogText } from "../packages/core/src/mcp/client.js"
import { mcpRegistry } from "../packages/core/src/mcp/registry.js"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify")

afterEach(() => vi.restoreAllMocks())

describe("task033 HTTP MCP redaction boundary", () => {
  it("omits endpoint and command from the general runtime status projection", async () => {
    const endpoint = "https://mcp.example.test/endpoint?opaque-value=do-not-expose"
    vi.spyOn(mcpRegistry, "getStatuses").mockReturnValue([
      {
        name: "penpot",
        transport: "http",
        enabled: true,
        required: false,
        ready: false,
        toolCount: 0,
        registeredToolCount: 0,
        command: "must-not-expose",
        url: endpoint,
        error: `request failed for ${endpoint}`,
        tools: [],
      },
    ])
    vi.spyOn(mcpRegistry, "getSummary").mockReturnValue({
      serverCount: 1,
      readyCount: 0,
      toolCount: 0,
      requiredFailures: 0,
    })
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app, DEFAULT_CONFIG)
    registerMcpRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/mcp/servers" })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.servers[0]).not.toHaveProperty("command")
      expect(body.servers[0]).not.toHaveProperty("url")
      expect(JSON.stringify(body)).not.toContain("opaque-value")
      expect(JSON.stringify(body)).toContain("[external-endpoint-redacted]")
    } finally {
      await app.close()
    }
  })

  it("redacts complete HTTP URLs rather than relying on secret parameter names", () => {
    expect(redactMcpLogText("failed https://example.test/path?opaque=visible")).toBe(
      "failed [external-endpoint-redacted]",
    )
  })
})
