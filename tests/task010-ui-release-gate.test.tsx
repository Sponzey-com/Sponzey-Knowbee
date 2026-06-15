import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"

import { SubAgentAdvancedSettingsPanel } from "../packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx"
import {
  BeginnerSubAgentCreateDialog,
  SubAgentReadinessPanel,
} from "../packages/webui/src/components/setup/SubAgentReadinessPanel.tsx"
import { ExecutorWorkspaceShell } from "../packages/webui/src/components/topology/ExecutorWorkspaceShell.tsx"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import { buildSubAgentAdvancedSettingsView } from "../packages/webui/src/lib/advanced-sub-agent-settings.ts"
import type { BeginnerSubAgentReadinessPanelView } from "../packages/webui/src/lib/beginner-sub-agents.ts"

const longWord = "매우긴서브에이전트이름".repeat(18)

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function readinessPanel(): BeginnerSubAgentReadinessPanelView {
  return {
    status: "pending_runtime",
    tone: "warning",
    title: longWord,
    summary: `${longWord} ${longWord}`,
    stats: {
      topLevelCount: 1,
      readyCount: 0,
      needsAttentionCount: 0,
      pendingRuntimeCount: 1,
      recentRuntimeLabel: "기록 없음",
    },
    cards: [
      {
        id: "card:long",
        displayName: longWord,
        displayLabel: longWord,
        role: `${longWord} 역할`,
        readinessState: "pending_runtime",
        lifecycleState: "saved",
        statusLabel: `${longWord} 상태`,
        summary: `${longWord} 요약`,
      },
    ],
    actions: [
      { id: "create", label: `${longWord} 추가` },
      { id: "topology", label: `${longWord} 토폴로지`, href: "/topology" },
      { id: "advanced", label: `${longWord} 고급`, href: "/settings?section=subAgents" },
    ],
  }
}

function advancedDraft(): SetupDraft {
  return {
    personal: {
      profileName: "dongwoo",
      displayName: "Dongwoo",
      language: "ko",
      timezone: "Asia/Seoul",
      workspace: "/tmp",
    },
    aiBackends: [],
    routingProfiles: [],
    mcp: { servers: [] },
    skills: { items: [] },
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
          agentId: "agent:lead",
          displayName: longWord,
          nickname: "Lead",
          role: `${longWord} 검토 담당`,
          description: `${longWord} 설명`,
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 1,
        },
      ],
      runtimeActiveAgentIds: ["agent:lead"],
      lastRuntimeSeenAtByAgentId: { "agent:lead": 1_780_000_200_000 },
      monitoring: {
        logLevel: "product",
        refreshedAt: 1_780_000_200_000,
        staleAfterMs: 60_000,
        events: [
          {
            eventId: "evt:secret",
            runId: "run:secret",
            at: 1_780_000_210_000,
            kind: "blocked",
            status: "blocked",
            actorAgentId: "agent:lead",
            summary:
              "endpoint https://user:password@example.com raw screenshot binary raw tool output token=raw-secret sk-task010-secret",
            reason: "stack trace raw payload task:internal agent:lead",
            debug: { relatedTaskId: "task:debug-secret", internalTraceId: "trace:debug-secret" },
          },
        ],
      },
    },
  }
}

describe("task010 UI release gate", () => {
  it("keeps beginner sub-agent setup inside responsive scroll and wrapping guards", () => {
    const panelHtml = renderToStaticMarkup(
      createElement(SubAgentReadinessPanel, {
        panel: readinessPanel(),
        language: "ko",
        onCreate: () => undefined,
      }),
    )
    const dialogHtml = renderToStaticMarkup(
      createElement(BeginnerSubAgentCreateDialog, {
        open: true,
        language: "ko",
        value: { displayName: longWord, nickname: longWord, role: longWord, description: longWord },
        fieldErrors: { displayName: `${longWord} 오류` },
        saving: false,
        onChange: () => undefined,
        onCancel: () => undefined,
        onSubmit: () => undefined,
      }),
    )
    const html = `${panelHtml}\n${dialogHtml}`

    expect(html).toContain('data-sub-agent-readiness-panel="pending_runtime"')
    expect(html).toContain('data-sub-agent-create-dialog="open"')
    expect(html).toContain("min-w-0")
    expect(html).toContain("[overflow-wrap:anywhere]")
    expect(html).toContain("overflow-y-auto")
    expect(html).toContain("max-h-[calc(100vh-2rem)]")
    expect(html).not.toMatch(/agent:/)
  })

  it("keeps topology shell controls reachable on narrow widths", () => {
    const html = renderToStaticMarkup(
      createElement(
        ExecutorWorkspaceShell,
        {
          executorCount: 1,
          connectionCount: 1,
          recommendedExecutors: [
            {
              id: "long",
              labelKo: longWord,
              labelEn: longWord,
              descriptionKo: longWord,
              descriptionEn: longWord,
            },
          ],
        },
        createElement("div", null, "canvas"),
      ),
    )

    expect(html).toContain('data-testid="executor-workspace-shell"')
    expect(html).toContain("grid min-h-0 flex-1 overflow-hidden")
    expect(html).toContain("overflow-y-auto")
    expect(html).toContain("overscroll-contain")
    expect(html).toContain("whitespace-normal")
    expect(html).toContain("[overflow-wrap:anywhere]")
  })

  it("keeps advanced settings and runtime monitor redacted and scrollable", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: advancedDraft(),
      selectedAgentId: "agent:lead",
      language: "ko",
      now: 1_780_000_215_000,
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

    expect(html).toContain('data-testid="sub-agent-runtime-monitor"')
    expect(html).toContain("max-h-[380px]")
    expect(html).toContain("overflow-y-auto")
    expect(html).toContain("[overflow-wrap:anywhere]")
    expect(text).toContain("[secret redacted]")
    expect(text).toContain("[진단 원문 숨김]")
    expect(text).not.toContain("sk-task010-secret")
    expect(text).not.toContain("raw-secret")
    expect(text).not.toContain("user:password")
    expect(text).not.toMatch(/raw payload|raw tool output|raw screenshot binary|stack trace/i)
    expect(text).not.toMatch(/run:secret|task:debug-secret|trace:debug-secret/)
  })
})
