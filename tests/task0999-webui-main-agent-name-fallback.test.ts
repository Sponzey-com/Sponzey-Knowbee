import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildUnifiedSettingsViewForSetupDraft } from "../packages/webui/src/lib/unified-settings-view.ts"
import type { SetupDraft, SetupSubAgentDraftItem } from "../packages/webui/src/contracts/setup.ts"

function subAgent(overrides: Partial<SetupSubAgentDraftItem> = {}): SetupSubAgentDraftItem {
  return {
    agentId: "agent:helper",
    parentAgentId: "agent:knowbee",
    agentName: "도우미",
    role: "정리 담당",
    description: "결과를 정리합니다.",
    status: "enabled",
    createdAt: 1,
    updatedAt: 1,
    profileVersion: 1,
    ...overrides,
  }
}

describe("task0999 webui main-agent name fallback", () => {
  it("uses the configured main-agent name for root labels while keeping product fallback separate", () => {
    const draft = {
      mainAgent: { name: "마당쇠" },
      subAgents: {
        orchestrationEnabled: true,
        items: [subAgent()],
        runtimeActiveAgentIds: [],
        lastRuntimeSeenAtByAgentId: {},
        monitoring: {
          activeRunIds: ["run:1"],
          events: [{
            eventId: "event:1",
            runId: "run:1",
            at: 1,
            kind: "final_delivery_prepared",
            status: "completed",
            actorAgentId: "agent:helper",
            targetAgentId: "agent:knowbee",
            summary: "도우미가 마당쇠에게 결과를 전달했습니다.",
          }],
        },
      },
    } as unknown as SetupDraft

    const view = buildUnifiedSettingsViewForSetupDraft({
      draft,
      language: "ko",
      selectedAgentId: "agent:helper",
      now: 2,
    })

    expect(view.summary.productName).toBe("노비")
    expect(view.graph.nodes[0]?.label).toBe("마당쇠")
    expect(view.graph.edges[0]?.sourceLabel).toBe("마당쇠")
    expect(view.agents[0]?.parentLabel).toBe("마당쇠")
    expect(view.selectedAgentDetail?.monitoring?.traceItems[0]?.targetLabel).toBe("마당쇠")
  })

  it("keeps WebUI display fallback names sourced from the main-agent copy module", () => {
    const files = [
      "packages/webui/src/lib/unified-settings-view.ts",
      "packages/webui/src/lib/topology-execution-trace.ts",
      "packages/webui/src/lib/runtime-inspector.ts",
      "packages/webui/src/lib/setup-readiness.ts",
      "packages/webui/src/lib/topology-sub-agent-sync.ts",
    ]

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf-8")

      expect(source, filePath).toMatch(/main-agent-copy|DEFAULT_MAIN_AGENT_NAME_|mainAgentNameForDraft/u)
      expect(source, filePath).not.toMatch(/\|\|\s*"노비"|\?\?\s*"노비"/u)
    }
  })
})
