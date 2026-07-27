import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildUnifiedSettingsViewModel } from "../packages/core/src/ui/unified-settings.ts"

describe("task0485 unified settings agent name only", () => {
  it("builds the core settings view from agentName without displayName or nickname inputs", () => {
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
          role: "자료 조사",
          workDescription: "근거를 수집합니다.",
          parentId: "agent:knowbee",
        },
      ],
    })

    expect(view.graph.nodes.map((item) => item.label)).toEqual(["마당쇠", "조사 담당"])
    expect(view.agents[0]?.label).toBe("조사 담당")
    expect(view.selectedAgentDetail?.label).toBe("조사 담당")
    expect(view.diagnostics.reasonCodes).toEqual([])
  })

  it("keeps displayName and nickname out of the unified settings core and adapter boundary", () => {
    const coreSource = readFileSync("packages/core/src/ui/unified-settings.ts", "utf8")
    const adapterSource = readFileSync("packages/webui/src/lib/unified-settings-view.ts", "utf8")

    expect(coreSource).not.toContain("displayName")
    expect(coreSource).not.toContain("nickname")
    expect(coreSource).not.toContain("display_name_required")
    expect(coreSource).not.toContain("display_name_duplicate")
    expect(adapterSource).not.toContain("displayName:")
    expect(adapterSource).not.toContain("nickname:")
  })
})
