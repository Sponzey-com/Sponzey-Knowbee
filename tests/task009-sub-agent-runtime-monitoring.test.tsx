import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { SubAgentAdvancedSettingsPanel } from "../packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  buildSubAgentAdvancedSettingsView,
} from "../packages/webui/src/lib/advanced-sub-agent-settings.ts"

function baseDraft(): SetupDraft {
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
          displayName: "Lead",
          nickname: "Lead",
          role: "취합 담당",
          description: "하위 결과를 검토하고 취합합니다.",
          delegationPolicy: {
            canDelegate: true,
            directChildOnly: true,
            allowedChildAgentIds: ["agent:research"],
            resultReviewRequired: true,
            aggregationMode: "parent_synthesis",
            redelegationAllowed: true,
            escalationPolicy: "return_to_parent",
            maxParallelSessions: 1,
          },
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 2,
        },
        {
          agentId: "agent:research",
          parentAgentId: "agent:lead",
          displayName: "Researcher",
          nickname: "Researcher",
          role: "조사 담당",
          description: "자료를 찾습니다.",
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 1,
        },
        {
          agentId: "agent:writer",
          displayName: "Writer",
          nickname: "Writer",
          role: "작성 담당",
          description: "답변을 작성합니다.",
          status: "disabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 1,
        },
      ],
      runtimeActiveAgentIds: ["agent:lead", "agent:research"],
      lastRuntimeSeenAtByAgentId: {
        "agent:lead": 1_780_000_220_000,
        "agent:research": 1_780_000_220_000,
      },
      monitoring: {
        logLevel: "product",
        refreshedAt: 1_780_000_230_000,
        staleAfterMs: 60_000,
        events: [
          {
            eventId: "evt:1",
            runId: "run:abc123",
            at: 1_780_000_200_000,
            kind: "request_received",
            status: "running",
            actorAgentId: "agent:nobie",
            targetAgentId: "agent:lead",
            summary: "Nobie가 Lead에게 요청을 전달했습니다.",
            reason: "channel token=raw-secret sk-raw-secret-should-hide",
            debug: { relatedTaskId: "task:secret-debug" },
          },
          {
            eventId: "evt:2",
            runId: "run:abc123",
            at: 1_780_000_201_000,
            kind: "delegation_planned",
            status: "running",
            actorAgentId: "agent:lead",
            targetAgentId: "agent:research",
            summary: "Lead가 Researcher에게 자료 조사를 위임했습니다.",
          },
          {
            eventId: "evt:3",
            runId: "run:abc123",
            at: 1_780_000_202_000,
            kind: "child_result_returned",
            status: "reviewing",
            actorAgentId: "agent:research",
            targetAgentId: "agent:lead",
            summary: "Researcher가 조사 결과를 Lead에게 돌려줬습니다.",
            reviewStatus: "reviewing_child_result",
            quality: "missing_information",
            latestResultSummary: "가격 근거가 부족합니다.",
          },
          {
            eventId: "evt:4",
            runId: "run:abc123",
            at: 1_780_000_203_000,
            kind: "redelegation_planned",
            status: "running",
            actorAgentId: "agent:lead",
            targetAgentId: "agent:research",
            summary: "Lead가 누락된 가격 근거를 정리해 다시 위임했습니다.",
            reviewStatus: "needs_redelegation",
            quality: "split_required",
            redelegation: {
              previousChildAgentId: "agent:research",
              nextTargetAgentId: "agent:research",
              previousResultSummary: "초안은 충분하지 않습니다.",
              refinedInstructionSummary: "가격 근거와 날짜를 분리해서 다시 확인합니다.",
              changedInputSummary: "검증 기준을 날짜/출처 중심으로 변경",
              validationMethod: "출처 2개 이상 확인",
            },
          },
          {
            eventId: "evt:5",
            runId: "run:abc123",
            at: 1_780_000_204_000,
            kind: "parent_reviewing",
            status: "reviewing",
            actorAgentId: "agent:lead",
            targetAgentId: "agent:research",
            summary: "Lead가 Researcher 결과를 검토 중입니다.",
            reviewStatus: "reviewing_child_result",
          },
          {
            eventId: "evt:6",
            runId: "run:abc123",
            at: 1_780_000_205_000,
            kind: "parent_aggregating",
            status: "running",
            actorAgentId: "agent:lead",
            summary: "Lead가 결과를 취합합니다.",
            reviewStatus: "aggregated",
            latestResultSummary: "근거가 취합되었습니다.",
          },
          {
            eventId: "evt:7",
            runId: "run:abc123",
            at: 1_780_000_206_000,
            kind: "final_delivery_prepared",
            status: "completed",
            actorAgentId: "agent:lead",
            targetAgentId: "agent:nobie",
            summary: "Lead가 Nobie에게 최종 전달 준비를 마쳤습니다.",
            reviewStatus: "final_ready",
            quality: "sufficient",
            latestResultSummary: "최종 답변 준비 완료",
          },
          {
            eventId: "evt:8",
            runId: "run:abc123",
            at: 1_780_000_207_000,
            kind: "blocked",
            status: "blocked",
            actorAgentId: "agent:lead",
            targetAgentId: "agent:writer",
            summary: "비활성 Writer는 실행되지 않았습니다.",
            reason: "direct-child 또는 runtime active 조건 불충족, attemptCount=3",
          },
        ],
      },
    },
  }
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function monitoringMarkup(markup: string): string {
  const start = markup.indexOf('data-testid="sub-agent-runtime-monitor"')
  if (start < 0) return ""
  const end = markup.indexOf('data-testid="sub-agent-advanced-detail-sections"', start)
  return markup.slice(start, end > start ? end : undefined)
}

describe("task009 sub-agent runtime monitoring", () => {
  it("projects delegation trace with user-facing actor and target names", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: baseDraft(),
      selectedAgentId: "agent:lead",
      language: "ko",
      now: 1_780_000_240_000,
    })

    expect(view.selectedAgent?.monitoring.activeRuns).toEqual([
      expect.objectContaining({ label: "실행 1", status: "blocked" }),
    ])
    expect(view.selectedAgent?.monitoring.traceItems.map((item) => `${item.actorLabel}->${item.targetLabel}:${item.kind}`)).toContain(
      "Lead->Researcher:delegation_planned",
    )
    expect(view.selectedAgent?.monitoring.traceItems.map((item) => item.actorLabel)).not.toContain("agent:lead")
    expect(view.selectedAgent?.monitoring.traceItems.map((item) => item.targetLabel)).not.toContain("agent:research")
    expect(view.selectedAgent?.monitoring.treePaths).toContain("Nobie -> Lead -> Researcher")
  })

  it("renders review, aggregation, and redelegation state before final delivery", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: baseDraft(),
      selectedAgentId: "agent:lead",
      language: "ko",
      now: 1_780_000_240_000,
    })
    const html = renderToStaticMarkup(createElement(SubAgentAdvancedSettingsPanel, {
      view,
      saving: false,
      onSelectAgent: () => undefined,
      onSave: () => undefined,
      onCancel: () => undefined,
      onRefresh: () => undefined,
    }))
    const text = visibleText(html)

    expect(html).toContain('data-testid="sub-agent-runtime-monitor"')
    expect(text).toContain("Lead가 Researcher에게 자료 조사를 위임했습니다.")
    expect(text).toContain("reviewing_child_result")
    expect(text).toContain("aggregated")
    expect(text).toContain("final_ready")
    expect(text).toContain("가격 근거와 날짜를 분리해서 다시 확인합니다.")
    expect(text).toContain("부모 검토 후 final delivery")
    expect(text).not.toContain("child 결과 바로 최종 전달")
  })

  it("redacts monitoring secrets and hides product-mode internal ids and debug payloads", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: baseDraft(),
      selectedAgentId: "agent:lead",
      language: "ko",
      now: 1_780_000_240_000,
    })
    const html = renderToStaticMarkup(createElement(SubAgentAdvancedSettingsPanel, {
      view,
      saving: false,
      onSelectAgent: () => undefined,
      onSave: () => undefined,
      onCancel: () => undefined,
      onRefresh: () => undefined,
    }))
    const text = visibleText(monitoringMarkup(html))

    expect(text).toContain("[secret redacted]")
    expect(text).not.toContain("sk-raw-secret-should-hide")
    expect(text).not.toContain("raw-secret")
    expect(text).not.toMatch(/agent:lead|agent:research|run:abc123|task:secret-debug/)
    expect(text).not.toMatch(/raw payload|raw tool input|raw tool output|stack trace/i)
  })

  it("defaults missing optional monitoring arrays without crashing", () => {
    const draft = baseDraft()
    draft.subAgents = {
      ...draft.subAgents!,
      monitoring: {
        logLevel: "product",
      },
    }
    const view = buildSubAgentAdvancedSettingsView({
      draft,
      selectedAgentId: "agent:lead",
      language: "ko",
      now: 1_780_000_240_000,
    })
    const html = renderToStaticMarkup(createElement(SubAgentAdvancedSettingsPanel, {
      view,
      saving: false,
      onSelectAgent: () => undefined,
      onSave: () => undefined,
      onCancel: () => undefined,
      onRefresh: () => undefined,
    }))

    expect(view.selectedAgent?.monitoring.traceItems).toEqual([])
    expect(html).toContain("아직 trace event가 없습니다.")
  })
})
