import { describe, expect, it } from "vitest"
import { createAgentPublicRef } from "../packages/core/src/capabilities/agent-public-reference.js"
import { buildCapabilityBindingProjection } from "../packages/core/src/capabilities/capability-binding-projection.js"
import { buildSkillBindingProjection } from "../packages/core/src/capabilities/skill-binding-projection.js"

const agents = [
  { agent_id: "a2", agent_name: "Writer", status: "enabled" },
  { agent_id: "a1", agent_name: "Analyst", status: "enabled" },
  { agent_id: "a3", agent_name: "Disabled", status: "disabled" },
]

describe("task031 capability binding projection", () => {
  it("keeps the Skill compatibility wrapper byte-equivalent", () => {
    const bindings = [{ agent_id: "a2", catalog_id: "skill-1", status: "enabled" }]
    const common = buildCapabilityBindingProjection({
      catalogId: "skill-1",
      agents,
      bindings,
      publicRefForAgentId: createAgentPublicRef,
    })
    const skill = buildSkillBindingProjection({
      skillId: "skill-1",
      agents,
      bindings,
      publicRefForAgentId: createAgentPublicRef,
    })
    expect(skill).toEqual(common)
  })

  it("separates MCP bindings without reading another catalog entry", () => {
    const projection = buildCapabilityBindingProjection({
      catalogId: "mcp:penpot",
      agents,
      bindings: [
        { agent_id: "a1", catalog_id: "mcp:penpot", status: "enabled" },
        { agent_id: "a2", catalog_id: "mcp:other", status: "enabled" },
        { agent_id: "a2", catalog_id: "mcp:penpot", status: "archived" },
      ],
      publicRefForAgentId: createAgentPublicRef,
    })
    expect(projection.boundAgents.map((agent) => agent.name)).toEqual(["Analyst"])
    expect(projection.availableAgents.map((agent) => agent.name)).toEqual(["Writer"])
    expect(JSON.stringify(projection)).not.toMatch(/"a1"|"a2"|mcp:|internal|secret/)
  })

  it("fails closed on invalid or colliding public refs", () => {
    expect(() =>
      buildCapabilityBindingProjection({
        catalogId: "mcp:penpot",
        agents,
        bindings: [],
        publicRefForAgentId: () => "agent-raw",
      }),
    ).toThrow("agent_public_ref_invalid")
    expect(() =>
      buildCapabilityBindingProjection({
        catalogId: "mcp:penpot",
        agents: agents.slice(0, 2),
        bindings: [],
        publicRefForAgentId: () => `agent_v1_${"a".repeat(24)}`,
      }),
    ).toThrow("agent_public_ref_collision")
  })
})
