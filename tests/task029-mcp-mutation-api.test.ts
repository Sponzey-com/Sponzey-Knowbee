import { describe, expect, it } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"
import type { McpMutationRuntime } from "../packages/core/src/capabilities/mcp-mutation-runtime.js"

function reply() { const state = { statusCode: 200 }; return { state, value: { status(code: number) { state.statusCode = code; return this }, send(payload: unknown) { return payload } } } }
function app() { const posts = new Map<string, Function>(); const patches = new Map<string, Function>(); return { posts, patches, value: { get() {}, post(path: string, _options: unknown, handler: Function) { posts.set(path, handler) }, patch(path: string, _options: unknown, handler: Function) { patches.set(path, handler) } } } }
const draft = { displayName: "Penpot", transport: "stdio", command: "node", args: ["server.mjs"], cwd: "/workspace", required: false }
const envelope = { scope: "capability:write", mutationId: "mutation-1", targetRevision: 8, purpose: "mcp_create", issuedAt: 100, nonce: "nonce-1" }
const active = { mutationId: "mutation-1", state: "active" as const, reasonCode: null, allowedActions: [], revision: 8, mcpRef: "mcp_v1_0123456789abcdef01234567" }

describe("task029 MCP mutation API", () => {
  it("derives the actor on create and returns only the public receipt", async () => {
    const target = app(); let received: any
    const mutationRuntime: McpMutationRuntime = { currentRevision: () => 7, executeCreate: async (input) => { received = input; return active }, executeUpdate: async () => active }
    registerMcpRoute(target.value as never, { mutationRuntime, mutationActorForRequest: () => "api:owner", now: () => 100 })
    const out = reply(); const result = await target.posts.get("/api/capabilities/mcp")?.({ body: { envelope, draft } }, out.value)
    expect(out.state.statusCode).toBe(201)
    expect(received.envelope.actorRef).toBe("api:owner")
    expect(result).toEqual(active)
    expect(JSON.stringify(result)).not.toMatch(/command|server\.mjs|workspace|actor|environment|secret/)
  })

  it("fails closed on client actor, dangerous draft fields and missing server actor", async () => {
    const target = app(); let calls = 0
    const mutationRuntime: McpMutationRuntime = { currentRevision: () => 7, executeCreate: async () => { calls += 1; return active }, executeUpdate: async () => active }
    registerMcpRoute(target.value as never, { mutationRuntime, mutationActorForRequest: () => "api:owner" })
    const spoofed = reply(); expect(await target.posts.get("/api/capabilities/mcp")?.({ body: { envelope: { ...envelope, actorRef: "spoof" }, draft } }, spoofed.value)).toEqual({ error: "mcp_create_request_invalid" }); expect(spoofed.state.statusCode).toBe(400)
    const dangerous = reply(); expect(await target.posts.get("/api/capabilities/mcp")?.({ body: { envelope, draft: { ...draft, environment: { TOKEN: "secret" } } } }, dangerous.value)).toEqual({ error: "mcp_create_request_invalid" }); expect(dangerous.state.statusCode).toBe(400)
    const deniedTarget = app(); registerMcpRoute(deniedTarget.value as never, { mutationRuntime, mutationActorForRequest: () => null })
    const denied = reply(); expect(await deniedTarget.posts.get("/api/capabilities/mcp")?.({ body: { envelope, draft } }, denied.value)).toEqual({ error: "mcp_create_actor_denied" }); expect(denied.state.statusCode).toBe(403)
    expect(calls).toBe(0)
  })

  it("maps update target, authorization and conflict results", async () => {
    const target = app(); let next = { ...active, state: "rejected" as const, reasonCode: "mcp_ref_not_found", revision: 7 }
    const mutationRuntime: McpMutationRuntime = { currentRevision: () => 7, executeCreate: async () => active, executeUpdate: async () => next }
    registerMcpRoute(target.value as never, { mutationRuntime, mutationActorForRequest: () => "api:owner" })
    const path = "/api/capabilities/mcp/:mcpRef"; const params = { mcpRef: active.mcpRef! }; const updateEnvelope = { ...envelope, purpose: "mcp_update" }
    const missing = reply(); expect(await target.patches.get(path)?.({ params, body: { envelope: updateEnvelope, draft } }, missing.value)).toMatchObject({ reasonCode: "mcp_ref_not_found" }); expect(missing.state.statusCode).toBe(404)
    next = { ...next, reasonCode: "mutation_revision_conflict" }; const conflict = reply(); await target.patches.get(path)?.({ params, body: { envelope: updateEnvelope, draft } }, conflict.value); expect(conflict.state.statusCode).toBe(409)
    next = { ...next, reasonCode: "mutation_scope_denied" }; const forbidden = reply(); await target.patches.get(path)?.({ params, body: { envelope: updateEnvelope, draft } }, forbidden.value); expect(forbidden.state.statusCode).toBe(403)
  })

  it("redacts unexpected infrastructure failures", async () => {
    const target = app(); const mutationRuntime: McpMutationRuntime = { currentRevision: () => 7, executeCreate: async () => { throw new Error("write /private/config token=secret") }, executeUpdate: async () => active }
    registerMcpRoute(target.value as never, { mutationRuntime, mutationActorForRequest: () => "api:owner" })
    const out = reply(); const result = await target.posts.get("/api/capabilities/mcp")?.({ body: { envelope, draft } }, out.value)
    expect(out.state.statusCode).toBe(500); expect(result).toEqual({ error: "mcp_create_failed" }); expect(JSON.stringify(result)).not.toMatch(/private|token|secret|write/)
  })
})
