import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createAgentPublicRef } from "../packages/core/src/agents/agent-public-reference.js"
import { buildAgentWorkspaceProjection } from "../packages/core/src/agents/agent-workspace-projection.js"

const agents = [
  {
    agentId: "agent:main-private",
    agentType: "knowbee" as const,
    status: "enabled" as const,
    agentName: "마당쇠",
    role: "Coordinator",
    profileVersion: 2,
    updatedAt: 900,
    model: { configured: true, availability: "ready" as const, modelName: "gpt-main" },
  },
  {
    agentId: "agent:research-private",
    agentType: "sub_agent" as const,
    status: "enabled" as const,
    agentName: "Researcher",
    role: "Evidence research",
    profileVersion: 3,
    updatedAt: 950,
    model: { configured: true, availability: "ready" as const, modelName: "gpt-worker" },
  },
]

describe("Task 037 agent workspace projection", () => {
  it("hides the main agent and projects bounded binding and hierarchy summaries", () => {
    const result = buildAgentWorkspaceProjection({
      agents,
      bindings: [
        {
          agentId: "agent:research-private",
          kind: "skill",
          status: "enabled",
          displayName: "UI UX Pro Max",
        },
        {
          agentId: "agent:research-private",
          kind: "mcp_server",
          status: "enabled",
          displayName: "Penpot",
        },
        {
          agentId: "agent:research-private",
          kind: "yeonjang",
          status: "enabled",
          displayName: "Studio Mac",
        },
      ],
      relationships: [],
      mainAgentName: "마당쇠",
      observedAt: 1_000,
      publicRefForAgentId: createAgentPublicRef,
    })

    expect(result.items).toEqual([
      expect.objectContaining({
        agentRef: expect.stringMatching(/^agent_v1_[a-f0-9]{24}$/u),
        name: "Researcher",
        role: "Evidence research",
        parentName: "마당쇠",
        directChildCount: 0,
        bindingCounts: { skills: 1, mcpServers: 1, yeonjang: 1 },
      }),
    ])
    expect(result.summary).toMatchObject({ total: 1, enabled: 1, issueCount: 0 })
    expect(result.items[0]).not.toHaveProperty("bindingNames")
    expect(result.details[0]).toMatchObject({
      bindingNames: {
        skills: ["UI UX Pro Max"],
        mcpServers: ["Penpot"],
        yeonjang: ["Studio Mac"],
      },
      directChildNames: [],
    })
    expect(JSON.stringify(result)).not.toMatch(
      /agent:main-private|agent:research-private|catalogId|bindingId/iu,
    )
  })

  it("reports duplicate, empty-name, and broken-binding diagnostics without failing the list", () => {
    const result = buildAgentWorkspaceProjection({
      agents: [
        ...agents,
        {
          ...agents[1],
          agentId: "agent:duplicate",
          agentName: " researcher ",
          status: "disabled" as const,
        },
        { ...agents[1], agentId: "agent:empty", agentName: "   ", status: "archived" as const },
      ],
      bindings: [
        { agentId: "agent:missing", kind: "skill", status: "enabled", displayName: "Orphan" },
      ],
      relationships: [],
      mainAgentName: "마당쇠",
      observedAt: 1_000,
      publicRefForAgentId: createAgentPublicRef,
    })

    expect(result.items).toHaveLength(3)
    expect(result.items.find((item) => item.name === "Researcher")?.diagnosticCodes).toContain(
      "agent_name_duplicate",
    )
    expect(result.items.find((item) => item.name === "이름 없음")?.diagnosticCodes).toContain(
      "agent_name_required",
    )
    expect(result.summary.diagnosticCodes).toContain("agent_binding_target_missing")
  })

  it("uses a stable namespace and has no infrastructure dependency", () => {
    expect(createAgentPublicRef("agent:one")).toBe(createAgentPublicRef("agent:one"))
    expect(createAgentPublicRef("agent:one")).not.toBe(createAgentPublicRef("agent:two"))
    const source = readFileSync("packages/core/src/agents/agent-workspace-projection.ts", "utf8")
    expect(source).not.toMatch(/node:|process\.env|Fastify|React|db\/|mqtt|filesystem/iu)
  })
})
