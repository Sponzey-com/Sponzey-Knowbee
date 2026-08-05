import { randomUUID } from "node:crypto"
import { type Server as HttpServer, createServer } from "node:http"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { McpServer } from "../packages/core/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js"
import { StreamableHTTPServerTransport } from "../packages/core/node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { testMcpServerConnection } from "../packages/core/src/control-plane/setup-extensions.js"
import { McpHttpClient } from "../packages/core/src/mcp/http-client.js"
import { mcpRegistry } from "../packages/core/src/mcp/registry.js"
import { initializeToolDispatcher } from "../packages/core/src/tools/index.js"

const servers: HttpServer[] = []

async function startFixture(): Promise<string> {
  const mcp = new McpServer({ name: "http-fixture", version: "1.0.0" })
  mcp.tool("inspect", "Read-only inspection", async () => ({
    content: [{ type: "text", text: "inspection-ok" }],
  }))
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    enableJsonResponse: true,
  })
  await mcp.connect(transport as never)
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const text = Buffer.concat(chunks).toString("utf8")
    await transport.handleRequest(request, response, text ? JSON.parse(text) : undefined)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(server)
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("fixture address unavailable")
  return `http://127.0.0.1:${address.port}/mcp`
}

beforeAll(() => initializeToolDispatcher(DEFAULT_CONFIG))
afterEach(async () => {
  await mcpRegistry.closeAll()
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  )
})

describe("task032 MCP Streamable HTTP client", () => {
  it("discovers and calls a read-only tool through the official SDK transport", async () => {
    const url = await startFixture()
    const client = new McpHttpClient({
      config: { transport: "http", url, startupTimeoutSec: 2, toolTimeoutSec: 2 },
    })
    await expect(client.listTools()).resolves.toEqual([
      expect.objectContaining({ name: "inspect", description: "Read-only inspection" }),
    ])
    await expect(client.callTool("inspect", {})).resolves.toMatchObject({
      output: "inspection-ok",
      isError: false,
    })
    await client.close()
  })

  it("registers an HTTP MCP without affecting the stdio application boundary", async () => {
    const url = await startFixture()
    await mcpRegistry.loadFromConfig({
      ...DEFAULT_CONFIG,
      mcp: { servers: { penpot_http: { transport: "http", url } } },
    })
    expect(mcpRegistry.getStatuses()).toEqual([
      expect.objectContaining({
        name: "penpot_http",
        transport: "http",
        ready: true,
        toolCount: 1,
      }),
    ])
  })

  it("probes HTTP MCP through the shared connection inspection adapter", async () => {
    const url = await startFixture()
    const result = await testMcpServerConnection(
      {
        id: "fixture",
        name: "HTTP fixture",
        transport: "http",
        command: "",
        argsText: "",
        cwd: "",
        url,
        required: false,
        enabled: true,
        status: "planned",
        tools: [],
      },
      "/unused",
    )
    expect(result).toMatchObject({ ok: true, tools: ["inspect"] })
    expect(JSON.stringify(result)).not.toContain(url)
  })

  it("honors cancellation and does not report an intentional close as a failure", async () => {
    const url = await startFixture()
    const exits: string[] = []
    const client = new McpHttpClient({
      config: { transport: "http", url, startupTimeoutSec: 2, toolTimeoutSec: 2 },
      onExit: (error) => exits.push(error),
    })
    const aborted = new AbortController()
    aborted.abort()
    await expect(client.listTools(aborted.signal)).rejects.toMatchObject({ name: "AbortError" })
    await expect(client.listTools()).resolves.toHaveLength(1)
    await client.close()
    expect(exits).toEqual([])
  })
})
