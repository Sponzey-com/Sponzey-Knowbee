import { describe, expect, it } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"

function reply() { const state = { statusCode: 200 }; return { state, value: { status(code: number) { state.statusCode = code; return this }, send(payload: unknown) { return payload } } } }
const catalog = [{ mcp_server_id: "mcp:penpot", status: "enabled" as const, display_name: "Penpot", metadata_json: JSON.stringify({ transport: "stdio" }), updated_at: 7 }]
const runtimes = [{ name: "penpot", transport: "stdio" as const, enabled: true, required: false, ready: true, toolCount: 1, registeredToolCount: 1, command: "/private/bin", tools: [{ name: "inspect", registeredName: "mcp__penpot__inspect", description: "Inspect" }] }]

describe("task027 MCP catalog API", () => {
  it("reads each owner once and returns a redacted list", async () => {
    const handlers = new Map<string, Function>()
    const reads = { catalog: 0, bindings: 0, runtime: 0 }
    registerMcpRoute({ get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} } as never, {
      catalogRepository: { listCatalog: () => { reads.catalog += 1; return catalog }, listBindings: () => { reads.bindings += 1; return [] } },
      runtimeRepository: { listStatuses: () => { reads.runtime += 1; return runtimes } },
      publicRefForMcpId: () => `mcp_v1_${"a".repeat(24)}`,
      now: () => 10,
    })
    const result = await handlers.get("/api/capabilities/mcp")?.({ query: { limit: 50 } }, reply().value)
    expect(result.items[0]).toMatchObject({ displayName: "Penpot", runtimeStatus: "ready" })
    expect(reads).toEqual({ catalog: 1, bindings: 1, runtime: 1 })
    expect(JSON.stringify(result)).not.toMatch(/command|registeredName|private|mcp:penpot/)
  })

  it("loads tool detail by opaque ref and returns 404 for an unknown ref", async () => {
    const handlers = new Map<string, Function>()
    const mcpRef = `mcp_v1_${"a".repeat(24)}`
    const reads = { catalog: 0, bindings: 0, runtime: 0 }
    registerMcpRoute({ get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} } as never, { catalogRepository: { listCatalog: () => { reads.catalog += 1; return catalog }, listBindings: () => { reads.bindings += 1; return [] } }, runtimeRepository: { listStatuses: () => { reads.runtime += 1; return runtimes } }, publicRefForMcpId: () => mcpRef, now: () => 10 })
    const detail = await handlers.get("/api/capabilities/mcp/:mcpRef")?.({ params: { mcpRef } }, reply().value)
    expect(detail.tools).toEqual([{ name: "inspect", description: "Inspect" }])
    expect(reads).toEqual({ catalog: 1, bindings: 1, runtime: 1 })
    const missingReply = reply()
    const missing = await handlers.get("/api/capabilities/mcp/:mcpRef")?.({ params: { mcpRef: `mcp_v1_${"b".repeat(24)}` } }, missingReply.value)
    expect(missingReply.state.statusCode).toBe(404)
    expect(missing).toEqual({ error: "mcp_ref_not_found" })
  })

  it("redacts repository failures", async () => {
    const handlers = new Map<string, Function>()
    registerMcpRoute({ get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} } as never, { catalogRepository: { listCatalog: () => { throw new Error("/private/path token=secret") }, listBindings: () => [] }, runtimeRepository: { listStatuses: () => runtimes } })
    const out = reply()
    const result = await handlers.get("/api/capabilities/mcp")?.({ query: {} }, out.value)
    expect(out.state.statusCode).toBe(500)
    expect(result).toEqual({ error: "mcp_catalog_projection_failed" })
    expect(JSON.stringify(result)).not.toMatch(/private|token|secret/)
  })

  it("rejects invalid query inputs without reading raw runtime details", async () => {
    const handlers = new Map<string, Function>()
    registerMcpRoute({ get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} } as never, { catalogRepository: { listCatalog: () => catalog, listBindings: () => [] }, runtimeRepository: { listStatuses: () => runtimes } })
    const out = reply()
    const result = await handlers.get("/api/capabilities/mcp")?.({ query: { limit: 1000 } }, out.value)
    expect(out.state.statusCode).toBe(400)
    expect(result).toEqual({ error: "mcp_catalog_limit_invalid" })
    const boundOut = reply()
    expect(await handlers.get("/api/capabilities/mcp")?.({ query: { bound: "yes" } }, boundOut.value)).toEqual({ error: "mcp_catalog_bound_invalid" })
    expect(boundOut.state.statusCode).toBe(400)
  })
})
