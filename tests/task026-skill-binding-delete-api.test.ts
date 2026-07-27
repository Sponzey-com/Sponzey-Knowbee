import { describe, expect, it } from "vitest"
import { registerCapabilitiesRoute } from "../packages/core/src/api/routes/capabilities.js"

function response() { const state = { statusCode: 200 }; return { state, reply: { status(code: number) { state.statusCode = code; return this }, send(payload: unknown) { return payload } } } }
const envelope = (purpose: string) => ({ scope: "capability:write", mutationId: "m1", targetRevision: 8, purpose, issuedAt: 1, nonce: "n1", actorRef: "spoofed" })

describe("task026 skill binding and delete API", () => {
  it("adds redacted bound and available agents to detail", async () => {
    const handlers = new Map<string, Function>()
    const skillRef = `skill_v1_${"a".repeat(24)}`
    registerCapabilitiesRoute({ get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} } as never, {
      skillCatalogRepository: { listSkills: () => [{ skill_id: "s1", status: "enabled", display_name: "UI", metadata_json: null, updated_at: 7 }], listBindings: () => [{ catalog_id: "s1", status: "enabled", updated_at: 7 }] },
      skillBindingProjectionRepository: { listAgents: () => [{ agent_id: "a1", agent_name: "Analyst", status: "enabled" }, { agent_id: "a2", agent_name: "Writer", status: "enabled" }], listBindings: () => [{ agent_id: "a1", catalog_id: "s1", status: "enabled" }] },
      skillPublicRefForId: () => skillRef,
      agentPublicRefForId: (id) => id === "a1" ? `agent_v1_${"a".repeat(24)}` : `agent_v1_${"b".repeat(24)}`,
    })
    const result = await handlers.get("/api/capabilities/skills/:skillRef")?.({ params: { skillRef } }, response().reply)
    expect(result.bindings).toEqual({ boundAgents: [{ agentRef: `agent_v1_${"a".repeat(24)}`, name: "Analyst" }], availableAgents: [{ agentRef: `agent_v1_${"b".repeat(24)}`, name: "Writer" }] })
    expect(JSON.stringify(result)).not.toMatch(/"a1"|"a2"|internal|secret|permission/)
  })

  it("derives actor and returns binding receipt", async () => {
    const handlers = new Map<string, Function>()
    let actor = ""
    registerCapabilitiesRoute({ get() {}, post() {}, patch(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, { mutationActorForRequest: () => "api:owner", skillBindingExecutor: async (input) => { actor = input.envelope.actorRef; return { mutationId: "m1", state: "active", reasonCode: null, allowedActions: [], revision: 8, skillRef: input.skillRef, agentRef: input.agentRef, bound: true } } })
    const out = response()
    const result = await handlers.get("/api/capabilities/skills/:skillRef/bindings/:agentRef")?.({ params: { skillRef: "skill-public", agentRef: "agent-public" }, body: { envelope: envelope("skill_bind"), bound: true } }, out.reply)
    expect(result).toMatchObject({ state: "active", bound: true })
    expect(actor).toBe("api:owner")
    expect(JSON.stringify(result)).not.toContain("actorRef")
  })

  it("returns user-facing in-use impact from delete", async () => {
    const handlers = new Map<string, Function>()
    registerCapabilitiesRoute({ get() {}, post() {}, delete(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, { mutationActorForRequest: () => "api:owner", skillDeleteExecutor: async (input) => ({ mutationId: "m1", state: "rejected", reasonCode: "skill_delete_in_use", allowedActions: [], revision: 7, skillRef: input.skillRef, deleted: false, impact: { bindingCount: 1, agentNames: ["Analyst"] } }) })
    const out = response()
    const result = await handlers.get("/api/capabilities/skills/:skillRef")?.({ params: { skillRef: "skill-public" }, body: { envelope: envelope("skill_delete") } }, out.reply)
    expect(out.state.statusCode).toBe(409)
    expect(result).toMatchObject({ reasonCode: "skill_delete_in_use", impact: { agentNames: ["Analyst"] } })
    expect(JSON.stringify(result)).not.toMatch(/internal|agent_id|nonce/)
  })
})
