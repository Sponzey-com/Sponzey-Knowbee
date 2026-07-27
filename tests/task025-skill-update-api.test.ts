import { describe, expect, it } from "vitest"
import { registerCapabilitiesRoute } from "../packages/core/src/api/routes/capabilities.js"

function replyState() {
  const state = { statusCode: 200 }
  return { state, reply: { status(code: number) { state.statusCode = code; return this }, send(payload: unknown) { return payload } } }
}

describe("task025 skill update API", () => {
  it("returns a redacted detail projection for one public reference", async () => {
    const handlers = new Map<string, Function>()
    const skillRef = `skill_v1_${"a".repeat(24)}`
    registerCapabilitiesRoute({ get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} } as never, {
      skillCatalogRepository: { listSkills: () => [{ skill_id: "internal-1", status: "enabled", display_name: "UI", metadata_json: JSON.stringify({ description: "Review", sourceKind: "local", canonicalPath: "/private" }), updated_at: 7 }], listBindings: () => [] },
      skillBindingProjectionRepository: { listAgents: () => [], listBindings: () => [] },
      skillPublicRefForId: () => skillRef,
      now: () => 100,
    })
    const { reply } = replyState()
    const result = await handlers.get("/api/capabilities/skills/:skillRef")?.({ params: { skillRef } }, reply)
    expect(result).toMatchObject({ skillRef, displayName: "UI", description: "Review", revision: 7 })
    expect(JSON.stringify(result)).not.toMatch(/internal-1|canonicalPath|\/private/)
  })

  it("resolves the public route and derives actor from authentication", async () => {
    const handlers = new Map<string, Function>()
    let input: Record<string, unknown> | null = null
    registerCapabilitiesRoute({ get() {}, post() {}, patch(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, {
      mutationActorForRequest: () => "api:owner",
      skillUpdateExecutor: async (value) => { input = value as never; return { mutationId: "m1", state: "active", reasonCode: null, allowedActions: [], revision: 8, skillRef: value.skillRef } },
    })
    const { state, reply } = replyState()
    const result = await handlers.get("/api/capabilities/skills/:skillRef")?.({ params: { skillRef: `skill_v1_${"a".repeat(24)}` }, body: { envelope: { actorRef: "spoofed", scope: "capability:write", mutationId: "m1", targetRevision: 8, purpose: "skill_update", issuedAt: 1, nonce: "n1" }, change: { runtimeStatus: "inactive" } } }, reply)
    expect(state.statusCode).toBe(200)
    expect(result).toMatchObject({ state: "active", revision: 8 })
    expect((input?.envelope as { actorRef: string }).actorRef).toBe("api:owner")
    expect(JSON.stringify(result)).not.toMatch(/nonce|actorRef|internal|canonicalPath/)
  })

  it("returns conflict receipts and rejects malformed status", async () => {
    const handlers = new Map<string, Function>()
    registerCapabilitiesRoute({ get() {}, post() {}, patch(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, {
      mutationActorForRequest: () => "api:owner",
      skillUpdateExecutor: async (value) => ({ mutationId: "m1", state: "rejected", reasonCode: "mutation_revision_conflict", allowedActions: [], revision: 7, skillRef: value.skillRef }),
    })
    const validEnvelope = { scope: "capability:write", mutationId: "m1", targetRevision: 8, purpose: "skill_update", issuedAt: 1, nonce: "n1" }
    const conflict = replyState()
    expect(await handlers.get("/api/capabilities/skills/:skillRef")?.({ params: { skillRef: "public" }, body: { envelope: validEnvelope, change: { displayName: "UI" } } }, conflict.reply)).toMatchObject({ reasonCode: "mutation_revision_conflict" })
    expect(conflict.state.statusCode).toBe(409)
    const invalid = replyState()
    expect(await handlers.get("/api/capabilities/skills/:skillRef")?.({ params: { skillRef: "public" }, body: { envelope: validEnvelope, change: { runtimeStatus: "archived" } } }, invalid.reply)).toEqual({ error: "skill_update_request_invalid" })
    expect(invalid.state.statusCode).toBe(400)
  })
})
