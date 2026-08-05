import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { SubAgentAdvancedSettingsPanel } from "../packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import { buildSubAgentAdvancedSettingsView } from "../packages/webui/src/lib/advanced-sub-agent-settings.ts"

function draft(overrides: Partial<SetupDraft> = {}): SetupDraft {
  return {
    personal: {
      profileName: "dongwoo",
      displayName: "Dongwoo",
      language: "ko",
      timezone: "Asia/Seoul",
      workspace: "/tmp",
    },
    aiBackends: [
      {
        id: "provider:openai",
        label: "OpenAI",
        kind: "provider",
        providerType: "openai",
        authMode: "api_key",
        credentials: { apiKey: "sk-test" },
        local: false,
        enabled: true,
        availableModels: ["gpt-5.4"],
        defaultModel: "gpt-5.4",
        status: "ready",
        summary: "primary",
        tags: ["primary"],
        endpoint: "https://api.openai.com/v1",
      },
    ],
    routingProfiles: [{ id: "default", label: "Default", targets: ["provider:openai"] }],
    mcp: {
      servers: [
        {
          id: "mcp:browser",
          name: "Browser",
          transport: "stdio",
          command: "browser",
          argsText: "",
          cwd: "",
          url: "",
          required: false,
          enabled: true,
          status: "ready",
          tools: ["search"],
        },
      ],
    },
    skills: {
      items: [
        {
          id: "skill:research",
          label: "Research",
          description: "Find facts",
          source: "builtin",
          path: "",
          enabled: true,
          required: false,
          status: "ready",
        },
      ],
    },
    security: {
      approvalMode: "on-miss",
      approvalTimeout: 60,
      approvalTimeoutFallback: "deny",
      maxDelegationTurns: 5,
    },
    channels: {} as SetupDraft["channels"],
    mqtt: { enabled: false, host: "0.0.0.0", port: 1883, username: "", password: "" },
    remoteAccess: { authEnabled: false, authToken: "", host: "127.0.0.1", port: 18888 },
    subAgents: {
      orchestrationEnabled: true,
      items: [
        {
          agentId: "agent:research",
          agentName: "Res",
          displayName: "Researcher",
          nickname: "Res",
          role: "자료 조사",
          description: "근거를 찾습니다.",
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 3,
        },
        {
          agentId: "agent:writer",
          agentName: "Writer",
          displayName: "Writer",
          nickname: "Writer",
          role: "답변 작성",
          description: "최종 답변을 정리합니다.",
          status: "degraded",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_200_000,
          profileVersion: 2,
        },
        {
          agentId: "agent:old",
          agentName: "Old",
          displayName: "Old Agent",
          nickname: "Old",
          role: "보관됨",
          description: "기본 목록에 보이지 않아야 합니다.",
          status: "archived",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_050_000,
          profileVersion: 1,
        },
      ],
      runtimeActiveAgentIds: ["agent:research"],
      lastRuntimeSeenAtByAgentId: { "agent:research": 1_780_000_250_000 },
    },
    ...overrides,
  }
}

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

describe("task005 advanced sub-agent settings", () => {
  it("builds an empty advanced shell without treating direct main-agent mode as an error", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: {
        ...draft(),
        subAgents: {
          orchestrationEnabled: false,
          items: [],
          runtimeActiveAgentIds: [],
          lastRuntimeSeenAtByAgentId: {},
        },
      },
      language: "ko",
    })

    expect(view.emptyState.kind).toBe("direct_main_agent")
    expect(view.rows).toHaveLength(0)
    expect(view.statusBar.validationTone).toBe("info")
    expect(view.globalPolicy.orchestrationModeLabel).toBe("메인 에이전트 직접 처리")
    expect(view.emptyState.title).toBe("메인 에이전트 직접 처리")
    expect(view.globalPolicy.orchestrationModeLabel).not.toContain("단일 노비")
    expect(view.emptyState.title).not.toContain("단일 노비")
  })

  it("separates global policy summary from selected per-agent detail", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:research",
      dirty: true,
      runtimeActiveVersion: 7,
      language: "ko",
      now: 1_780_000_310_000,
    })

    expect(view.globalPolicy).toEqual(
      expect.objectContaining({
        orchestrationModeLabel: "오케스트레이션",
        defaultModelLabel: "기본 AI 모델 설정됨",
        commonSkillMcpLabel: "작업 능력 1개 / 외부 기능 1개",
        affectedAgentCount: 2,
      }),
    )
    expect(view.selectedAgent?.agentName).toBe("Res")
    expect(view.selectedAgent?.description).toBe("자료 조사")
    expect(view.selectedAgent?.description).not.toBe("근거를 찾습니다.")
    expect(view.selectedAgent?.sections.map((section) => section.id)).toEqual([
      "identity",
      "model",
      "skill_mcp",
      "memory",
      "permission",
      "delegation",
      "monitoring",
    ])
    expect(view.statusBar.draftStateLabel).toBe("저장 전 변경 있음")
    expect(view.statusBar.runtimeActiveVersionLabel).toBe("v7")
  })

  it("hides archived agents by default and falls back when selected agent is archived", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:old",
      language: "ko",
    })

    expect(view.rows.map((row) => row.agentName)).toEqual(["Res", "Writer"])
    expect(view.archivedHiddenCount).toBe(1)
    expect(view.selectedAgent?.agentId).toBe("agent:research")
    expect(
      JSON.stringify(
        view.rows.map((row) => ({
          agentName: row.agentName,
          role: row.role,
          lifecycleLabel: row.lifecycleLabel,
          readinessLabel: row.readinessLabel,
        })),
      ),
    ).not.toMatch(/agent:old|agent:research|agent:writer/)
  })

  it("renders the two-pane component with list, detail shell, and status bar", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:writer",
      dirty: true,
      validationIssues: ["Writer의 런타임 반영 상태를 확인해야 합니다."],
      language: "ko",
    })
    const html = renderToStaticMarkup(
      createElement(SubAgentAdvancedSettingsPanel, {
        view,
        saving: false,
        onSelectAgent: () => undefined,
        onSave: () => undefined,
        onCancel: () => undefined,
        onRefresh: () => undefined,
      }),
    )
    const text = visibleText(html)

    expect(html).toContain('data-testid="sub-agent-advanced-settings-panel"')
    expect(html).toContain('data-testid="sub-agent-advanced-list"')
    expect(html).toContain('data-testid="sub-agent-advanced-detail"')
    expect(html).toContain('data-testid="sub-agent-advanced-status-bar"')
    expect(text).toContain("공통 정책")
    expect(text).toContain("메인 에이전트")
    expect(text).toContain("Writer")
    expect(text).not.toContain("최종 답변을 정리합니다.")
    expect(text).toContain("작업 능력/외부 기능")
    expect(text).toContain("메모리")
    expect(text).toContain("저장 전 변경 있음")
    expect(text).not.toContain("internal id")
    expect(text).not.toContain("agent:writer")
    expect(text).toContain("메인 에이전트는 이 화면에서 편집하지 않습니다")
    expect(text).toContain("직속 서브 에이전트")
    expect(text).not.toContain("직접 하위")
    expect(text).not.toMatch(/raw|payload/)
    expect(text).not.toContain("allowed ")
    expect(text).not.toContain("denied")
    expect(text).not.toContain("approval required")
    expect(text).not.toContain("direct child")
    expect(text).not.toContain("can delegate")
    expect(text).not.toContain("trace event")
    expect(text).not.toContain("runtime trace")
    expect(text).not.toContain("final delivery")
    expect(text).not.toContain("runs ")
    expect(text).not.toContain("event ")
  })

  it("keeps direct-child jargon out of advanced sub-agent settings source copy", () => {
    const source = [
      readFileSync("packages/webui/src/lib/advanced-sub-agent-settings.ts", "utf8"),
      readFileSync("packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx", "utf8"),
    ].join("\n")

    expect(source).toContain("직속 서브 에이전트")
    expect(source).toContain("immediate sub-agent")
    expect(source).not.toContain("직접 하위")
    expect(source).not.toContain("direct child")
  })

  it("marks per-agent overrides as isolated from global catalog edits", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:research",
      language: "ko",
    })
    const skillSection = view.selectedAgent?.sections.find((section) => section.id === "skill_mcp")

    expect(skillSection).toEqual(
      expect.objectContaining({
        title: "작업 능력/외부 기능",
        inheritanceState: "agent_only",
      }),
    )
    expect(skillSection?.summary).toContain("서브 에이전트별 활성")
    expect(skillSection?.helper).toContain("서브 에이전트별 연결")
  })
})
