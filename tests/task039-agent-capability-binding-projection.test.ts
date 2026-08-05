import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildAgentCapabilityBindingProjection,
  queryAgentCapabilityBindings,
} from "../packages/core/src/agents/agent-capability-binding-projection.js"

const refs = {
  skill: `skill_v1_${"a".repeat(24)}`,
  mcp_server: `mcp_v1_${"b".repeat(24)}`,
  yeonjang: `yeonjang_v1_${"c".repeat(24)}`,
}
const catalog = [
  {
    internalId: "skill:ui",
    kind: "skill" as const,
    displayName: "UI UX Pro Max",
    catalogStatus: "enabled" as const,
    runtimeStatus: "ready" as const,
    revision: 2,
  },
  {
    internalId: "mcp:penpot",
    kind: "mcp_server" as const,
    displayName: "Penpot",
    catalogStatus: "disabled" as const,
    runtimeStatus: "unavailable" as const,
    revision: 3,
  },
  {
    internalId: "mac:studio",
    kind: "yeonjang" as const,
    displayName: "Studio Mac",
    catalogStatus: "archived" as const,
    runtimeStatus: "unknown" as const,
    revision: 4,
  },
]

describe("Task 039 agent capability binding projection", () => {
  it("unifies Skill, MCP and Yeonjang without exposing internal identifiers", () => {
    const result = buildAgentCapabilityBindingProjection({
      agentId: "agent:private",
      agentRef: `agent_v1_${"d".repeat(24)}`,
      catalog,
      bindings: [
        {
          agentId: "agent:private",
          kind: "skill",
          catalogId: "skill:ui",
          status: "enabled",
          revision: 5,
        },
        {
          agentId: "agent:other",
          kind: "mcp_server",
          catalogId: "mcp:penpot",
          status: "enabled",
          revision: 99,
        },
      ],
      observedAt: 10,
      publicRefForCapability: (kind) => refs[kind],
    })
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityRef: refs.skill,
          displayName: "UI UX Pro Max",
          bound: true,
          editable: true,
        }),
        expect.objectContaining({
          capabilityRef: refs.mcp_server,
          bound: false,
          reasonCodes: ["capability_catalog_inactive", "capability_runtime_unavailable"],
        }),
        expect.objectContaining({
          capabilityRef: refs.yeonjang,
          editable: false,
          reasonCodes: ["capability_catalog_archived"],
        }),
      ]),
    )
    expect(result.revisions).toEqual({ skill: 5, mcp_server: 3, yeonjang: 4 })
    expect(JSON.stringify(result)).not.toMatch(
      /agent:private|skill:ui|mcp:penpot|mac:studio|bindingId|secret/iu,
    )
  })

  it("diagnoses orphan bindings and rejects duplicate catalog or binding snapshots", () => {
    const base = {
      agentId: "agent:private",
      agentRef: `agent_v1_${"d".repeat(24)}`,
      observedAt: 10,
      publicRefForCapability: (kind: keyof typeof refs) => refs[kind],
    }
    expect(
      buildAgentCapabilityBindingProjection({
        ...base,
        catalog,
        bindings: [
          {
            agentId: "agent:private",
            kind: "skill",
            catalogId: "skill:missing",
            status: "enabled",
            revision: 1,
          },
        ],
      }).orphanReasonCodes,
    ).toEqual(["capability_binding_orphaned"])
    expect(() =>
      buildAgentCapabilityBindingProjection({
        ...base,
        catalog: [catalog[0], catalog[0]],
        bindings: [],
      }),
    ).toThrow("agent_capability_catalog_duplicate")
    expect(() =>
      buildAgentCapabilityBindingProjection({
        ...base,
        catalog,
        bindings: [
          {
            agentId: "agent:private",
            kind: "skill",
            catalogId: "skill:ui",
            status: "enabled",
            revision: 1,
          },
          {
            agentId: "agent:private",
            kind: "skill",
            catalogId: "skill:ui",
            status: "disabled",
            revision: 1,
          },
        ],
      }),
    ).toThrow("agent_capability_binding_duplicate")
  })

  it("bounds search and kind filtering and has no infrastructure dependency", () => {
    const projection = buildAgentCapabilityBindingProjection({
      agentId: "agent:private",
      agentRef: `agent_v1_${"d".repeat(24)}`,
      catalog,
      bindings: [],
      observedAt: 10,
      publicRefForCapability: (kind) => refs[kind],
    })
    expect(
      queryAgentCapabilityBindings(projection, {
        search: "pen",
        kind: "mcp_server",
        limit: 1,
      }).items.map((item) => item.displayName),
    ).toEqual(["Penpot"])
    const source = readFileSync(
      "packages/core/src/agents/agent-capability-binding-projection.ts",
      "utf8",
    )
    expect(source).not.toMatch(/node:|process\.env|Fastify|React|db\//iu)
  })
})
