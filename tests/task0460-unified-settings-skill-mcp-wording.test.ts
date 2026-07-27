import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildUnifiedSettingsViewModel } from "../packages/core/src/ui/unified-settings.ts"

describe("task0460 unified settings skill/MCP wording", () => {
  it("uses user-facing work ability and external feature wording in Korean detail sections", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "ko",
      productName: "노비",
      mode: "orchestration",
      lifecycleState: "drafting",
      rootAgent: { id: "agent:knowbee", agentName: "마당쇠" },
      selectedAgentId: "agent:research",
      agents: [
        {
          id: "agent:research",
          agentName: "조사 담당",
          parentId: "agent:knowbee",
          detail: {
            skillMcp: {
              enabledSkillCount: 2,
              enabledMcpServerCount: 1,
              enabledToolCount: 3,
            },
          },
        },
      ],
    })

    const section = view.selectedAgentDetail?.sections.find((item) => item.id === "skill_mcp")

    expect(section?.title).toBe("작업 능력/외부 기능")
    expect(section?.summary).toBe("작업 능력 2, 외부 기능 1, 도구 3")
  })

  it("uses user-facing work ability and external feature wording in English detail sections", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "en",
      productName: "Knowbee",
      mode: "orchestration",
      lifecycleState: "drafting",
      rootAgent: { id: "agent:knowbee", agentName: "Chief" },
      selectedAgentId: "agent:research",
      agents: [
        {
          id: "agent:research",
          agentName: "Research",
          parentId: "agent:knowbee",
          detail: {
            skillMcp: {
              enabledSkillCount: 2,
              enabledMcpServerCount: 1,
              enabledToolCount: 3,
            },
          },
        },
      ],
    })

    const section = view.selectedAgentDetail?.sections.find((item) => item.id === "skill_mcp")

    expect(section?.title).toBe("Work Abilities / External Features")
    expect(section?.summary).toBe("Work abilities 2, External features 1, Tools 3")
  })

  it("does not keep old Skill/MCP user-facing strings in the core projection source", () => {
    const source = readFileSync("packages/core/src/ui/unified-settings.ts", "utf8")

    expect(source).not.toContain('"Skill/MCP"')
    expect(source).not.toContain("summary: `Skill ")
    expect(source).not.toContain("MCP ${mcpCount}")
  })
})
