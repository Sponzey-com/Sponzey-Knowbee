import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { buildUnifiedSettingsViewModel } from "../packages/core/src/ui/unified-settings.ts"
import { buildUnifiedSettingsViewForSetupDraft } from "../packages/webui/src/lib/unified-settings-view.ts"
import { UnifiedSettingsSummaryPanel } from "../packages/webui/src/components/setup/UnifiedSettingsSummaryPanel.tsx"
import type { SetupDraft, SetupSubAgentDraftItem } from "../packages/webui/src/contracts/setup.ts"

const rootAgent = {
  id: "agent:knowbee",
  agentName: "Knowbee",
}

function setupDraft(item: SetupSubAgentDraftItem): SetupDraft {
  return {
    subAgents: {
      orchestrationEnabled: true,
      items: [item],
      runtimeActiveAgentIds: [item.agentId],
      lastRuntimeSeenAtByAgentId: { [item.agentId]: 1 },
      monitoring: {
        logLevel: "debug",
        activeRunIds: ["run:secret-internal-1"],
        events: [
          {
            eventId: "event:1",
            runId: "run:secret-internal-1",
            at: 1,
            kind: "child_running",
            status: "running",
            actorAgentId: item.agentId,
            summary: "Child is running",
          },
        ],
      },
    },
  } as unknown as SetupDraft
}

function agent(overrides: Partial<SetupSubAgentDraftItem> = {}): SetupSubAgentDraftItem {
  return {
    agentId: "agent:researcher",
    parentAgentId: "agent:knowbee",
    agentName: "조사",
    displayName: "Researcher",
    role: "Research helper",
    description: "Collect evidence and summarize it.",
    skillMcpBindings: {
      enabledSkillIds: ["skill:search", "skill:summary"],
      enabledMcpServerIds: ["mcp:private-server"],
      enabledToolNames: ["web.search", "notes.write", "token:unsafe-tool-secret"],
      disabledToolNames: [],
    },
    modelPolicy: {
      mode: "override",
      providerId: "openai",
      modelId: "gpt-4.1-mini",
      fallbackModelId: "gpt-4.1",
    },
    memoryPolicy: {
      mode: "private",
      retention: "session",
      compaction: "enabled",
      rawWindowSize: 12000,
      compactThreshold: 18000,
      capsuleMode: "session_compaction",
      handoffCapsuleAllowed: true,
    },
    capabilityPolicy: {
      permissionProfile: "standard",
      allowedCapabilityIds: ["screen_capture", "keyboard_control"],
      deniedCapabilityIds: ["token:unsafe-capability-secret"],
      approvalRequiredCapabilityIds: ["system_control"],
      osSensitiveCapabilityIds: ["screen_capture"],
    },
    delegationPolicy: {
      canDelegate: true,
      directChildOnly: true,
      allowedChildAgentIds: ["agent:child-internal-1"],
      resultReviewRequired: true,
      aggregationMode: "parent_synthesis",
      redelegationAllowed: true,
      escalationPolicy: "return_to_parent",
      maxParallelSessions: 2,
    },
    status: "enabled",
    createdAt: 1,
    updatedAt: 1,
    profileVersion: 1,
    ...overrides,
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(collectStrings)
  return Object.values(value).flatMap(collectStrings)
}

describe("task007 unified settings detail sections", () => {
  it("adds stable selected-agent detail sections to the core view model without leaking ids", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "en",
      productName: "Knowbee",
      mode: "orchestration",
      lifecycleState: "drafting",
      rootAgent,
      selectedAgentId: "agent:researcher",
      agents: [
        {
          id: "agent:researcher",
          agentName: "Research",
          role: "Research helper",
          workDescription: "Collect evidence and summarize it.",
          parentId: "agent:knowbee",
          detail: {
            model: { mode: "override", providerLabel: "OpenAI", modelLabel: "gpt-4.1-mini" },
            skillMcp: { enabledSkillCount: 2, enabledMcpServerCount: 1, enabledToolCount: 3 },
            memory: { rawWindowSize: 12000, compactThreshold: 18000, capsuleMode: "session_compaction" },
            permissions: { permissionProfile: "standard", allowedCount: 2, deniedCount: 1, approvalRequiredCount: 1 },
            delegation: { canDelegate: true, directChildOnly: true, allowedChildCount: 1, resultReviewRequired: true, redelegationAllowed: true, maxParallelSessions: 2 },
            monitoring: { logLevel: "debug", eventCount: 1, activeRunCount: 1 },
          },
        },
      ],
    })

    expect(view.selectedAgentDetail?.label).toBe("Research")
    expect(view.selectedAgentDetail?.sections.map((section) => section.id)).toEqual([
      "model",
      "skill_mcp",
      "memory",
      "permissions",
      "delegation",
      "monitoring",
    ])
    expect(view.selectedAgentDetail?.sections.find((section) => section.id === "model")).toEqual(
      expect.objectContaining({ title: "Model", status: "ready", summary: expect.stringContaining("Override") }),
    )
    expect(collectStrings(view.selectedAgentDetail).join(" ")).not.toContain("agent:researcher")
  })

  it("maps setup draft policies to selected detail summaries without exposing common catalog ids", () => {
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft: setupDraft(agent()),
      language: "ko",
      selectedAgentId: "agent:researcher",
    })

    const detailText = collectStrings(view.selectedAgentDetail).join(" ")

    expect(view.selectedAgentDetail?.sections.map((section) => section.id)).toEqual([
      "model",
      "skill_mcp",
      "memory",
      "permissions",
      "delegation",
      "monitoring",
    ])
    expect(detailText).toContain("모델")
    expect(detailText).toContain("작업 능력 2")
    expect(detailText).toContain("외부 기능 1")
    expect(detailText).toContain("압축")
    expect(detailText).toContain("승인 1")
    expect(detailText).toContain("재위임")
    expect(detailText).not.toContain("mcp:private-server")
    expect(detailText).not.toContain("skill:search")
    expect(detailText).not.toContain("token:unsafe")
    expect(detailText).not.toContain("agent:child-internal-1")
    expect(detailText).not.toContain("run:secret")
  })

  it("uses explicit setup agentName for selected labels", () => {
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft: setupDraft(agent({
        agentName: "정리 담당",
        displayName: "Researcher",
      })),
      language: "ko",
      selectedAgentId: "agent:researcher",
    })

    expect(view.agents[0]?.label).toBe("정리 담당")
    expect(view.selectedAgent?.label).toBe("정리 담당")
    expect(view.selectedAgentDetail?.label).toBe("정리 담당")
  })

  it("renders selected detail sections in the summary panel without raw advanced contracts", () => {
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft: setupDraft(agent()),
      language: "ko",
      selectedAgentId: "agent:researcher",
    })
    const html = renderToStaticMarkup(createElement(UnifiedSettingsSummaryPanel, { view }))

    expect(html).toContain('data-testid="unified-settings-selected-detail"')
    expect(html).toContain('data-testid="unified-settings-detail-section"')
    expect(html).toContain("모델")
    expect(html).toContain("작업 능력/외부 기능")
    expect(html).toContain("메모리")
    expect(html).toContain("권한")
    expect(html).toContain("위임")
    expect(html).toContain("모니터링")
    expect(html).not.toContain("WorkOrder Template")
    expect(html).not.toContain("JSON/YAML")
    expect(html).not.toContain("raw schema")
    expect(html).not.toContain("raw MCP")
    expect(html).not.toContain("mcp:private-server")
    expect(html).not.toContain("agent:child-internal-1")
  })

  it("keeps the detail adapter and panel free of hidden environment and storage access", () => {
    const adapterSource = readFileSync("packages/webui/src/lib/unified-settings-view.ts", "utf8")
    const panelSource = readFileSync("packages/webui/src/components/setup/UnifiedSettingsSummaryPanel.tsx", "utf8")
    const combined = `${adapterSource}\n${panelSource}`

    expect(combined).not.toMatch(/process\.env/)
    expect(combined).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
    expect(combined).not.toMatch(/fetch\(|readFile|writeFile/)
  })
})
