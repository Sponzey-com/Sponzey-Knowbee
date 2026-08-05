import { describe, expect, it } from "vitest"
import { createAgentPublicRef } from "../packages/core/src/capabilities/agent-public-reference.js"
import { buildSkillBindingProjection } from "../packages/core/src/capabilities/skill-binding-projection.js"
import { buildSkillCatalogPage } from "../packages/core/src/capabilities/skill-catalog-query.js"
import { createSkillBindingRequest, createSkillDeleteRequest, initialSkillBindingFlow, reduceSkillBindingFlow } from "../packages/webui/src/lib/skill-detail-flow.js"

describe("task026 skill binding projection", () => {
  it("creates stable opaque agent references", () => {
    expect(createAgentPublicRef("internal-agent-1")).toMatch(/^agent_v1_[a-f0-9]{24}$/)
    expect(createAgentPublicRef("internal-agent-1")).toBe(createAgentPublicRef("internal-agent-1"))
    expect(createAgentPublicRef("internal-agent-1")).not.toContain("internal")
  })

  it("sorts enabled agents by name and separates bound from available", () => {
    const projection = buildSkillBindingProjection({
      skillId: "skill-1",
      agents: [
        { agent_id: "a2", agent_name: "Writer", status: "enabled" },
        { agent_id: "a1", agent_name: "Analyst", status: "enabled" },
        { agent_id: "a3", agent_name: "Hidden", status: "disabled" },
      ],
      bindings: [{ agent_id: "a2", catalog_id: "skill-1", status: "enabled" }],
      publicRefForAgentId: createAgentPublicRef,
    })
    expect(projection.boundAgents.map((agent) => agent.name)).toEqual(["Writer"])
    expect(projection.availableAgents.map((agent) => agent.name)).toEqual(["Analyst"])
    expect(JSON.stringify(projection)).not.toMatch(/"a1"|"a2"|internal|secret|permission/)
  })

  it("fails closed on public ref collisions and remains deterministic for 500 agents", () => {
    const agents = Array.from({ length: 500 }, (_, index) => ({ agent_id: `a${index}`, agent_name: `Agent ${String(index).padStart(3, "0")}`, status: "enabled" as const }))
    expect(() => buildSkillBindingProjection({ skillId: "skill-1", agents: agents.slice(0, 2), bindings: [], publicRefForAgentId: () => `agent_v1_${"a".repeat(24)}` })).toThrow("agent_public_ref_collision")
    const projection = buildSkillBindingProjection({ skillId: "skill-1", agents, bindings: [], publicRefForAgentId: createAgentPublicRef })
    expect(projection.availableAgents).toHaveLength(500)
    expect(projection.availableAgents[0]?.name).toBe("Agent 000")
    expect(projection.availableAgents[499]?.name).toBe("Agent 499")
  })

  it("advances item and catalog revisions when a binding changes", () => {
    const page = buildSkillCatalogPage({ rows: [{ skill_id: "skill-1", status: "enabled", display_name: "UI", metadata_json: null, updated_at: 7 }], bindings: [{ catalog_id: "skill-1", status: "enabled", updated_at: 9 }], query: {}, observedAt: 10, publicRefForSkillId: () => `skill_v1_${"a".repeat(24)}` })
    expect(page.items[0]).toMatchObject({ bindingCount: 1, revision: 9 })
    expect(page.revision).toBe(9)
  })

  it("manages binding edits explicitly and creates redacted mutation DTOs", () => {
    const viewing = initialSkillBindingFlow(["agent-a"])
    const editing = reduceSkillBindingFlow(viewing, { type: "edit" })
    const changed = reduceSkillBindingFlow(editing, { type: "toggle", agentRef: "agent-b" })
    expect(changed).toMatchObject({ state: "editing", draftBoundAgentRefs: ["agent-a", "agent-b"] })
    const ids = ["m1", "n1", "m2", "n2"]
    const binding = createSkillBindingRequest({ bound: true, revision: 7, now: 100, randomId: () => ids.shift()! })
    const deletion = createSkillDeleteRequest({ revision: 8, now: 101, randomId: () => ids.shift()! })
    expect(binding.envelope).toMatchObject({ purpose: "skill_bind", targetRevision: 8 })
    expect(deletion.envelope).toMatchObject({ purpose: "skill_delete", targetRevision: 9 })
    expect(JSON.stringify({ binding, deletion })).not.toMatch(/actor|internal|path|agentRef/)
  })
})
