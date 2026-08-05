import { describe, expect, it } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"

function response() { const state = { statusCode: 200 }; return { state, reply: { status(code: number) { state.statusCode = code; return this }, send(payload: unknown) { return payload } } } }
const draft = { displayName: "Penpot", transport: "stdio", command: "node", args: ["server.mjs"], cwd: "/workspace", required: false }

describe("task028 MCP probe API", () => {
  it("derives the actor and returns only a redacted receipt", async () => {
    const handlers = new Map<string, Function>(); let actor = ""; let calls = 0
    registerMcpRoute({ get() {}, post(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, { probeActorForRequest: () => "api:owner", runtimeWorkspaceForRequest: () => "/workspace", probeExecutor: async (input) => { calls += 1; actor = input.actorRef; return { state: "ready", ready: true, reasonCode: null, tools: [{ name: "inspect", description: "Inspect" }], observedAt: 10 } } })
    const result = await handlers.get("/api/capabilities/mcp/probe")?.({ body: { draft } }, response().reply)
    expect(result).toMatchObject({ state: "ready", ready: true, tools: [{ name: "inspect" }] })
    expect(actor).toBe("api:owner")
    expect(calls).toBe(1)
    expect(JSON.stringify(result)).not.toMatch(/actor|command|workspace|server\.mjs|internal|secret/)
  })

  it("denies a missing principal before probing", async () => {
    const handlers = new Map<string, Function>(); let called = false
    registerMcpRoute({ get() {}, post(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, { probeActorForRequest: () => null, runtimeWorkspaceForRequest: () => "/workspace", probeExecutor: async () => { called = true; throw new Error("unexpected") } })
    const out = response(); expect(await handlers.get("/api/capabilities/mcp/probe")?.({ body: { draft } }, out.reply)).toEqual({ error: "mcp_probe_actor_denied" })
    expect(out.state.statusCode).toBe(403); expect(called).toBe(false)
  })

  it("maps malformed drafts and accepts a valid HTTP draft without exposing inputs", async () => {
    const handlers = new Map<string, Function>()
    registerMcpRoute({ get() {}, post(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, { probeActorForRequest: () => "api:owner", runtimeWorkspaceForRequest: () => "/workspace", probeExecutor: async () => ({ state: "ready", ready: true, reasonCode: null, tools: [], observedAt: 10 }) })
    const malformed = response(); expect(await handlers.get("/api/capabilities/mcp/probe")?.({ body: { draft: { ...draft, environment: { TOKEN: "secret" } } } }, malformed.reply)).toEqual({ error: "mcp_probe_request_invalid" }); expect(malformed.state.statusCode).toBe(400)
    const spoofed = response(); expect(await handlers.get("/api/capabilities/mcp/probe")?.({ body: { draft, actorRef: "spoofed" } }, spoofed.reply)).toEqual({ error: "mcp_probe_request_invalid" }); expect(spoofed.state.statusCode).toBe(400)
    const invalidHttp = response(); const invalidResult = await handlers.get("/api/capabilities/mcp/probe")?.({ body: { draft: { ...draft, transport: "http" } } }, invalidHttp.reply); expect(invalidHttp.state.statusCode).toBe(422); expect(invalidResult.reasonCode).toBe("mcp_url_missing")
    const validHttp = response(); const validResult = await handlers.get("/api/capabilities/mcp/probe")?.({ body: { draft: { ...draft, transport: "http", command: "", args: [], cwd: "", url: "https://mcp.example.test/endpoint" } } }, validHttp.reply); expect(validHttp.state.statusCode).toBe(200); expect(validResult).toMatchObject({ state: "ready", ready: true })
    expect(JSON.stringify(validResult)).not.toMatch(/example\.test|endpoint/)
  })

  it("redacts infrastructure exceptions", async () => {
    const handlers = new Map<string, Function>()
    registerMcpRoute({ get() {}, post(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, { probeActorForRequest: () => "api:owner", runtimeWorkspaceForRequest: () => "/workspace", probeExecutor: async () => { throw new Error("spawn /private/path token=secret") } })
    const out = response(); const result = await handlers.get("/api/capabilities/mcp/probe")?.({ body: { draft } }, out.reply)
    expect(out.state.statusCode).toBe(500); expect(result).toEqual({ error: "mcp_connection_probe_failed" }); expect(JSON.stringify(result)).not.toMatch(/private|token|secret|spawn/)
  })
})
