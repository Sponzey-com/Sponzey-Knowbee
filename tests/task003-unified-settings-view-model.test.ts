import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildUnifiedSettingsViewModel,
  type UnifiedSettingsAgentInput,
  type UnifiedSettingsMode,
} from "../packages/core/src/ui/unified-settings.ts"

const rootAgent = {
  id: "agent:knowbee",
  displayName: "Knowbee",
  nickname: "노비",
}

function agent(overrides: Partial<UnifiedSettingsAgentInput> = {}): UnifiedSettingsAgentInput {
  return {
    id: "agent:researcher",
    agentName: "조사",
    displayName: "Researcher",
    nickname: "조사",
    role: "Research helper",
    workDescription: "Collect evidence for the parent agent.",
    parentId: "agent:knowbee",
    ...overrides,
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(collectStrings)
  return Object.values(value).flatMap(collectStrings)
}

describe("task003 unified settings view model builder", () => {
  it("builds a skipped single Knowbee summary without treating missing sub-agents as an error", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "ko",
      productName: "노비",
      mode: "single_knowbee" as unknown as UnifiedSettingsMode,
      lifecycleState: "empty",
      rootAgent,
      agents: [],
    })

    expect(view.title).toBe("서브 에이전트 설정")
    expect(view.summary.mode).toBe("direct_main_agent")
    expect(view.summary.status).toBe("skipped")
    expect(view.summary.primaryAction).toEqual({
      id: "create_first_sub_agent",
      label: "서브 에이전트 추가",
      disabled: false,
    })
    expect(view.sections.map((section) => section.id)).toEqual([
      "required_setup",
      "sub_agents",
      "monitoring",
      "diagnostics",
    ])
    expect(view.sections.find((section) => section.id === "sub_agents")).toEqual(
      expect.objectContaining({ status: "skipped", itemCount: 0 }),
    )
  })

  it("disables save and activate actions when readiness is blocked", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "ko",
      productName: "노비",
      mode: "orchestration",
      lifecycleState: "drafting",
      rootAgent,
      agents: [
        agent({ id: "agent:a", agentName: "조사", displayName: "Researcher", nickname: "legacy-a" }),
        agent({ id: "agent:b", agentName: " 조사 ", displayName: "Writer", nickname: "legacy-b" }),
      ],
    })

    expect(view.summary.status).toBe("blocked")
    expect(view.actions.find((action) => action.id === "save_settings")).toEqual(
      expect.objectContaining({ disabled: true, disabledReason: "readiness_blocked" }),
    )
    expect(view.actions.find((action) => action.id === "activate_settings")).toEqual(
      expect.objectContaining({ disabled: true, disabledReason: "readiness_blocked" }),
    )
    expect(view.diagnostics.reasonCodes).toContain("agent_name_duplicate")
  })

  it("projects agent list, selected detail, and graph labels without using internal ids as user-facing labels", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "ko",
      productName: "노비",
      mode: "orchestration",
      lifecycleState: "saved",
      rootAgent,
      selectedAgentId: "agent:researcher",
      agents: [
        agent(),
        agent({
          id: "agent:writer",
          agentName: "작성",
          displayName: "Writer",
          nickname: "작성",
          role: "Writing helper",
          workDescription: "Draft the parent-facing response.",
          parentId: "agent:researcher",
        }),
      ],
    })

    expect(view.agents.map((item) => item.label)).toEqual(["조사", "작성"])
    expect(view.selectedAgent).toEqual(
      expect.objectContaining({
        label: "조사",
        role: "Research helper",
        childCount: 1,
        parentLabel: "노비",
      }),
    )
    expect(view.graph.nodes.map((node) => node.label)).toEqual(["노비", "조사", "작성"])
    expect(view.graph.edges).toEqual([
      { sourceLabel: "노비", targetLabel: "조사" },
      { sourceLabel: "조사", targetLabel: "작성" },
    ])

    const userFacingText = [
      view.agents.map((item) => item.label),
      view.agents.map((item) => item.description),
      view.selectedAgent?.label,
      view.selectedAgent?.description,
      view.graph.nodes.map((node) => node.label),
      view.graph.edges.flatMap((edge) => [edge.sourceLabel, edge.targetLabel]),
    ].flat()
    expect(userFacingText.join(" ")).not.toMatch(/agent:researcher|agent:writer/)
  })

  it("does not expose legacy nickname or displayName as the agent label when agentName is missing", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "ko",
      productName: "노비",
      mode: "orchestration",
      lifecycleState: "drafting",
      rootAgent,
      selectedAgentId: "agent:legacy",
      agents: [
        agent({
          id: "agent:legacy",
          agentName: undefined,
          displayName: "Legacy Display",
          nickname: "Legacy Nickname",
        }),
      ],
    })

    const labels = [
      view.agents[0]?.label,
      view.selectedAgent?.label,
      view.selectedAgentDetail?.label,
      view.graph.nodes.map((node) => node.label),
      view.graph.edges.flatMap((edge) => [edge.sourceLabel, edge.targetLabel]),
    ].flat().join(" ")

    expect(view.summary.status).toBe("needs_attention")
    expect(view.diagnostics.reasonCodes).toContain("agent_name_required")
    expect(labels).toContain("서브 에이전트")
    expect(labels).not.toContain("Legacy Display")
    expect(labels).not.toContain("Legacy Nickname")
  })

  it("redacts unsafe labels, descriptions, and diagnostics while keeping ids only in action payloads", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "ko",
      productName: "노비",
      mode: "orchestration",
      lifecycleState: "drafting",
      rootAgent,
      selectedAgentId: "agent:secret-internal-123",
      agents: [
        agent({
          id: "agent:secret-internal-123",
          agentName: "Bearer sk-task003-agent-name-secret-1234567890",
          displayName: "{\"token\":\"sk-task003-secret-value-1234567890\"}",
          nickname: "Bearer sk-task003-nickname-secret-1234567890",
          role: "Uses /Users/dongwooshin/.knowbee/private/raw.json",
          workDescription: "{\"raw\":\"xoxb-task003-secret-token-1234567890\"}",
        }),
      ],
    })

    const serializedUserText = collectStrings({
      title: view.title,
      summary: view.summary,
      sections: view.sections,
      agents: view.agents.map(({ label, description, statusLabel }) => ({ label, description, statusLabel })),
      selectedAgent: view.selectedAgent
        ? {
            label: view.selectedAgent.label,
            description: view.selectedAgent.description,
            role: view.selectedAgent.role,
            parentLabel: view.selectedAgent.parentLabel,
          }
        : undefined,
      graph: {
        nodes: view.graph.nodes.map(({ label, statusLabel }) => ({ label, statusLabel })),
        edges: view.graph.edges,
      },
      diagnostics: view.diagnostics,
    }).join(" ")

    expect(serializedUserText).not.toContain("sk-task003")
    expect(serializedUserText).not.toContain("xoxb-task003")
    expect(serializedUserText).not.toContain("/Users/dongwooshin")
    expect(serializedUserText).not.toContain("agent:secret-internal-123")
    expect(serializedUserText).not.toContain("{\"token\"")
    expect(view.actions.some((action) => action.payload?.agentId === "agent:secret-internal-123")).toBe(true)
    expect(view.diagnostics.redactedFieldCount).toBeGreaterThanOrEqual(3)
  })

  it("keeps the unified view model builder free of external framework and environment access", () => {
    const source = readFileSync("packages/core/src/ui/unified-settings.ts", "utf8")

    expect(source).not.toMatch(/from\s+["']react["']/)
    expect(source).not.toMatch(/process\.env/)
    expect(source).not.toMatch(/readFile|writeFile|fetch\(/)
    expect(source).not.toMatch(/\.\.\/db\/|\.\.\/api\/|\.\.\/channels\//)
  })
})
