import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { buildUnifiedSettingsViewModel } from "../packages/core/src/ui/unified-settings.ts"
import { buildUnifiedSettingsViewForSetupDraft } from "../packages/webui/src/lib/unified-settings-view.ts"
import { UnifiedSettingsSummaryPanel } from "../packages/webui/src/components/setup/UnifiedSettingsSummaryPanel.tsx"
import type { SetupDraft, SetupSubAgentDraftItem } from "../packages/webui/src/contracts/setup.ts"

const now = 1_780_000_240_000

const rootAgent = {
  id: "agent:knowbee",
  agentName: "노비",
}

function baseAgent(overrides: Partial<SetupSubAgentDraftItem> = {}): SetupSubAgentDraftItem {
  return {
    agentId: "agent:lead",
    parentAgentId: "agent:knowbee",
    agentName: "Lead",
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
    createdAt: 1,
    updatedAt: 1,
    profileVersion: 1,
    ...overrides,
  }
}

function draftWithMonitoring(): SetupDraft {
  const lead = baseAgent()
  const researcher = baseAgent({
    agentId: "agent:research",
    parentAgentId: "agent:lead",
    agentName: "Researcher",
    displayName: "Researcher",
    nickname: "Researcher",
    role: "조사 담당",
    description: "자료를 찾습니다.",
    delegationPolicy: undefined,
  })
  return {
    subAgents: {
      orchestrationEnabled: true,
      items: [lead, researcher],
      runtimeActiveAgentIds: ["agent:lead", "agent:research"],
      lastRuntimeSeenAtByAgentId: {
        "agent:lead": now - 20_000,
        "agent:research": now - 20_000,
      },
      monitoring: {
        logLevel: "product",
        refreshedAt: now - 10_000,
        staleAfterMs: 60_000,
        activeRunIds: ["run:task008-secret"],
        events: [
          {
            eventId: "evt:1",
            runId: "run:task008-secret",
            at: now - 5_000,
            kind: "delegation_planned",
            status: "running",
            actorAgentId: "agent:lead",
            targetAgentId: "agent:research",
            summary: "Lead가 Researcher에게 자료 조사를 위임했습니다.",
            reason: "token=raw-secret sk-task008-secret-should-hide task:debug-secret",
            debug: { relatedTaskId: "task:debug-secret", internalTraceId: "trace:debug-secret", attemptCount: 3 },
          },
          {
            eventId: "evt:2",
            runId: "run:task008-secret",
            at: now - 4_000,
            kind: "child_result_returned",
            status: "reviewing",
            actorAgentId: "agent:research",
            targetAgentId: "agent:lead",
            summary: "Researcher가 조사 결과를 Lead에게 돌려줬습니다.",
            reviewStatus: "reviewing_child_result",
            quality: "missing_information",
            latestResultSummary: "가격 근거가 부족합니다. raw payload sk-task008-result-secret",
          },
          {
            eventId: "evt:3",
            runId: "run:task008-secret",
            at: now - 3_000,
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
            eventId: "evt:4",
            runId: "run:task008-secret",
            at: now - 2_000,
            kind: "parent_aggregating",
            status: "running",
            actorAgentId: "agent:lead",
            summary: "Lead가 결과를 취합합니다.",
            reviewStatus: "aggregated",
            latestResultSummary: "근거가 취합되었습니다.",
          },
          {
            eventId: "evt:5",
            runId: "run:task008-secret",
            at: now - 1_000,
            kind: "final_delivery_prepared",
            status: "completed",
            actorAgentId: "agent:lead",
            targetAgentId: "agent:knowbee",
            summary: "Lead가 Knowbee에게 최종 전달 준비를 마쳤습니다.",
            reviewStatus: "final_ready",
            quality: "sufficient",
            latestResultSummary: "최종 답변 준비 완료",
          },
        ],
      },
    },
  } as unknown as SetupDraft
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(collectStrings)
  return Object.values(value).flatMap(collectStrings)
}

describe("task008 unified settings runtime monitoring", () => {
  it("builds a product-safe core monitoring projection with parent-child attribution", () => {
    const view = buildUnifiedSettingsViewModel({
      locale: "ko",
      productName: "노비",
      mode: "orchestration",
      lifecycleState: "drafting",
      rootAgent,
      selectedAgentId: "agent:lead",
      agents: [
        {
          id: "agent:lead",
          agentName: "Lead",
          role: "취합 담당",
          workDescription: "하위 결과를 검토하고 취합합니다.",
          parentId: "agent:knowbee",
          detail: {
            monitoring: {
              logLevel: "product",
              state: "loaded",
              eventCount: 2,
              activeRunCount: 1,
              treePaths: ["노비 -> Lead -> Researcher"],
              traceItems: [
                {
                  actorLabel: "Lead",
                  targetLabel: "Researcher",
                  kind: "delegation_planned",
                  status: "running",
                  summary: "Lead가 Researcher에게 자료 조사를 위임했습니다.",
                },
                {
                  actorLabel: "Researcher",
                  targetLabel: "Lead",
                  kind: "child_result_returned",
                  status: "reviewing",
                  summary: "Researcher가 조사 결과를 Lead에게 돌려줬습니다.",
                  reviewStatus: "reviewing_child_result",
                  quality: "missing_information",
                  latestResultSummary: "가격 근거가 부족합니다.",
                },
              ],
            },
          },
        },
      ],
    })

    expect(view.selectedAgentDetail?.monitoring?.treePaths).toContain("노비 -> Lead -> Researcher")
    expect(view.selectedAgentDetail?.monitoring?.traceItems.map((item) => `${item.actorLabel}->${item.targetLabel}:${item.kind}`)).toContain(
      "Lead->Researcher:delegation_planned",
    )
    expect(view.selectedAgentDetail?.monitoring?.reviewSummary).toContain("부모")
    expect(collectStrings(view.selectedAgentDetail?.monitoring).join(" ")).not.toMatch(/agent:lead|run:|task:/)
  })

  it("maps setup monitoring events to names, paths, review, aggregation, and redelegation summaries", () => {
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft: draftWithMonitoring(),
      language: "ko",
      selectedAgentId: "agent:lead",
      now,
    })

    const monitoring = view.selectedAgentDetail?.monitoring
    const text = collectStrings(monitoring).join(" ")

    expect(monitoring?.state).toBe("loaded")
    expect(monitoring?.activeRunCount).toBe(1)
    expect(monitoring?.treePaths).toContain("노비 -> Lead -> Researcher")
    expect(monitoring?.traceItems.map((item) => `${item.actorLabel}->${item.targetLabel}:${item.kind}`)).toContain(
      "Lead->Researcher:delegation_planned",
    )
    expect(text).toContain("가격 근거와 날짜를 분리해서 다시 확인합니다.")
    expect(text).toContain("부모 검토 후 final delivery 준비")
    expect(text).toContain("최종 답변 준비 완료")
    expect(text).not.toContain("child 결과 바로 최종 전달")
    expect(text).not.toMatch(/agent:lead|agent:research|run:task008-secret|task:debug-secret|trace:debug-secret/)
    expect(text).not.toContain("sk-task008-secret-should-hide")
    expect(text).not.toContain("raw-secret")
    expect(text).not.toContain("raw payload")
  })

  it("uses explicit setup agentName for monitoring labels", () => {
    const draft = draftWithMonitoring()
    draft.subAgents = {
      ...draft.subAgents!,
      items: draft.subAgents!.items.map((item) => {
        if (item.agentId === "agent:lead") return { ...item, agentName: "총괄" }
        if (item.agentId === "agent:research") return { ...item, agentName: "조사원" }
        return item
      }),
    }
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft,
      language: "ko",
      selectedAgentId: "agent:lead",
      now,
    })
    const monitoring = view.selectedAgentDetail?.monitoring

    expect(view.selectedAgent?.label).toBe("총괄")
    expect(monitoring?.treePaths).toContain("노비 -> 총괄 -> 조사원")
    expect(monitoring?.traceItems.map((item) => `${item.actorLabel}->${item.targetLabel}:${item.kind}`)).toContain(
      "총괄->조사원:delegation_planned",
    )
  })

  it("renders monitoring in the unified summary panel without raw ids or debug payloads", () => {
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft: draftWithMonitoring(),
      language: "ko",
      selectedAgentId: "agent:lead",
      now,
    })
    const html = renderToStaticMarkup(createElement(UnifiedSettingsSummaryPanel, { view }))
    const text = visibleText(html)

    expect(html).toContain('data-testid="unified-settings-monitoring"')
    expect(html).toContain('data-testid="unified-settings-monitoring-trace-item"')
    expect(text).toContain("Lead가 Researcher에게 자료 조사를 위임했습니다.")
    expect(text).toContain("부모 검토 후 final delivery 준비")
    expect(text).toContain("노비 -&gt; Lead -&gt; Researcher")
    expect(text).not.toMatch(/agent:lead|agent:research|run:task008-secret|task:debug-secret|trace:debug-secret/)
    expect(text).not.toContain("sk-task008")
    expect(text).not.toContain("raw payload")
  })

  it("defaults missing optional monitoring arrays without crashing", () => {
    const draft = draftWithMonitoring()
    draft.subAgents = {
      ...draft.subAgents!,
      monitoring: {
        logLevel: "product",
      },
    }
    const view = buildUnifiedSettingsViewForSetupDraft({
      draft,
      language: "ko",
      selectedAgentId: "agent:lead",
      now,
    })
    const html = renderToStaticMarkup(createElement(UnifiedSettingsSummaryPanel, { view }))

    expect(view.selectedAgentDetail?.monitoring?.traceItems).toEqual([])
    expect(html).toContain("아직 trace event가 없습니다.")
  })
})
