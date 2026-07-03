import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { buildUnifiedSettingsViewForSetupDraft } from "../packages/webui/src/lib/unified-settings-view.ts"
import { UnifiedSettingsSummaryPanel } from "../packages/webui/src/components/setup/UnifiedSettingsSummaryPanel.tsx"
import type { SetupDraft, SetupSubAgentDraftItem } from "../packages/webui/src/contracts/setup.ts"

function draftWithSubAgents(input: {
  orchestrationEnabled: boolean
  items: SetupSubAgentDraftItem[]
}): SetupDraft {
  return {
    subAgents: {
      orchestrationEnabled: input.orchestrationEnabled,
      items: input.items,
      runtimeActiveAgentIds: [],
      lastRuntimeSeenAtByAgentId: {},
    },
  } as unknown as SetupDraft
}

function agent(overrides: Partial<SetupSubAgentDraftItem> = {}): SetupSubAgentDraftItem {
  return {
    agentId: "agent:researcher",
    parentAgentId: "agent:knowbee",
    displayName: "Researcher",
    nickname: "조사",
    role: "Research helper",
    description: "Collect evidence and return a short summary.",
    status: "enabled",
    createdAt: 1,
    updatedAt: 1,
    profileVersion: 1,
    ...overrides,
  }
}

describe("task006 unified settings summary panel", () => {
  it("adapts an empty single Knowbee setup draft without treating missing sub-agents as an error", () => {
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft: draftWithSubAgents({ orchestrationEnabled: false, items: [] }),
      language: "ko",
    })

    expect(view.title).toBe("서브 에이전트 설정")
    expect(view.summary.productName).toBe("노비")
    expect(view.summary.mode).toBe("single_knowbee")
    expect(view.summary.status).toBe("skipped")
    expect(view.summary.issueCount).toBe(0)
    expect(view.summary.primaryAction).toEqual({
      id: "create_first_sub_agent",
      label: "서브 에이전트 추가",
      disabled: false,
    })
  })

  it("marks enabled orchestration without sub-agents as needing attention", () => {
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft: draftWithSubAgents({ orchestrationEnabled: true, items: [] }),
      language: "en",
    })

    expect(view.title).toBe("Sub-Agent Settings")
    expect(view.summary.productName).toBe("Knowbee")
    expect(view.summary.mode).toBe("orchestration")
    expect(view.summary.status).toBe("needs_attention")
    expect(view.diagnostics.reasonCodes).toEqual(["sub_agent_required"])
    expect(view.sections.find((section) => section.id === "sub_agents")).toEqual(
      expect.objectContaining({ status: "needs_attention", itemCount: 0 }),
    )
  })

  it("renders summary, sections, and agent rows without exposing internal ids or unsafe draft text", () => {
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft: draftWithSubAgents({
        orchestrationEnabled: true,
        items: [
          agent({
            agentId: "agent:secret-internal-123",
            displayName: "{\"token\":\"sk-task006-secret-value-1234567890\"}",
            nickname: "Bearer sk-task006-nickname-secret-1234567890",
            role: "Uses /Users/dongwooshin/.knowbee/private/raw.json",
            description: "{\"raw\":\"xoxb-task006-secret-token-1234567890\"}",
          }),
        ],
      }),
      language: "ko",
      selectedAgentId: "agent:secret-internal-123",
    })

    const html = renderToStaticMarkup(createElement(UnifiedSettingsSummaryPanel, { view }))

    expect(html).toContain('data-testid="unified-settings-summary-panel"')
    expect(html).toContain('data-status="ready"')
    expect(html).toContain("서브 에이전트 설정")
    expect(html).toContain("저장")
    expect(html).toContain("서브 에이전트")
    expect(html).toContain('data-testid="unified-settings-agent-row"')
    expect(html).not.toContain("agent:secret-internal-123")
    expect(html).not.toContain("sk-task006")
    expect(html).not.toContain("xoxb-task006")
    expect(html).not.toContain("/Users/dongwooshin")
    expect(html).not.toContain("{&quot;token&quot;")
  })

  it("connects the /sub-agents page to the unified settings adapter and panel", () => {
    const source = readFileSync("packages/webui/src/pages/TopologyWorkspacePage.tsx", "utf8")

    expect(source).toContain("buildUnifiedSettingsViewForSetupDraft")
    expect(source).toContain("UnifiedSettingsSummaryPanel")
    expect(source).toContain("selectedAgentId")
    expect(source).not.toContain("evaluateUnifiedSettingsReadiness")
    expect(source).not.toContain("buildUnifiedSettingsViewModel")
  })

  it("keeps the WebUI adapter free of hidden IO and process environment access", () => {
    const source = readFileSync("packages/webui/src/lib/unified-settings-view.ts", "utf8")

    expect(source).toContain("buildUnifiedSettingsViewModel")
    expect(source).not.toMatch(/process\.env/)
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
    expect(source).not.toMatch(/fetch\(|readFile|writeFile/)
  })
})
