import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import type { RunRuntimeInspectorProjection } from "../packages/webui/src/contracts/runs.ts"
import { RunRuntimeInspectorPanel } from "../packages/webui/src/components/runs/RunRuntimeInspectorPanel.tsx"
import {
  buildRuntimeInspectorViewModels,
  buildRuntimeInspectorSummaryCards,
  describeRuntimeApprovalState,
  describeRuntimeFinalizerStatus,
  describeRuntimeTopologyRouting,
  runtimeOrchestrationModeLabel,
  runtimeTopologyReasonLabel,
  runtimeControlActionLabels,
  runtimeExecutorDisplayName,
  runtimeExecutorRoleName,
  runtimeSubSessionAgentName,
  runtimeValidationStatusLabel,
  selectRuntimeSubSession,
  selectRuntimeTopologyActiveState,
} from "../packages/webui/src/lib/runtime-inspector.js"

const text = (ko: string, _en: string) => ko
const now = Date.UTC(2026, 3, 24, 1, 0, 0)

function projection(): RunRuntimeInspectorProjection {
  return {
    schemaVersion: 1,
    runId: "run:task024",
    requestGroupId: "group:task024",
    requestIdentity: {
      runId: "run:task024",
      requestGroupId: "group:task024",
      lineageRootRunId: "group:task024",
      rootRunId: "group:task024",
      userMessageKey: "telegram:chat:task024",
      requestIsolationMode: "root",
      continuationSource: "new_root",
      contextMode: "isolated",
    },
    generatedAt: now,
    orchestrationMode: "orchestration",
    topologyRouting: {
      mode: "route",
      reasonCode: "execution_decision_selected_executor",
      featureFlagMode: "off",
      executionDecisionSource: "knowbee_harness",
      executionDecisionGraphId: "execution-graph:task024",
      executionDecisionGraphSource: "workspace_draft",
      executionDecisionCurrentExecutorId: "agent:knowbee",
      executionDecisionAvailableExecutorIds: ["workspace:draft:node:researcher"],
      executionDecisionDiagnosticExecutorIds: ["workspace:draft:node:reviewer"],
      executionDecisionAllExecutorIds: [
        "agent:knowbee",
        "workspace:draft:node:researcher",
        "workspace:draft:node:reviewer",
      ],
      executionDecisionSelectedExecutorId: "workspace:draft:node:researcher",
      executionDecisionSelectedConnectionPath: ["workspace:draft:node:researcher"],
      executionDecisionNormalizedConnectionPath: ["agent:knowbee", "workspace:draft:node:researcher"],
      executionDecisionRoute: "delegate_to_child",
      executionDecisionFallbackReason: "self_solve",
      executionDecisionValidationStatus: "valid",
      executionDecisionExecutorNameById: {
        "agent:knowbee": "노비",
        "workspace:draft:node:researcher": "Researcher",
        "workspace:draft:node:reviewer": "Reviewer",
        "node:researcher": "Researcher",
        "node:reviewer": "Reviewer",
      },
      executionDecisionExecutorRoleNameById: {
        "agent:knowbee": "메인 에이전트",
        "workspace:draft:node:researcher": "시장 분석 실행자",
        "workspace:draft:node:reviewer": "검토 실행자",
        "node:researcher": "시장 분석 실행자",
        "node:reviewer": "검토 실행자",
      },
      riskBoundaryRequiresUserApproval: false,
      riskBoundaryReason: "공개 정보 검토",
      topologyId: "workspace:draft",
      topologyName: "첫 토폴로지",
      topologyVersion: 1,
      topologySchemaVersion: 2,
      topologyMigrationSource: "executor_topology_v2_materialized_read_model",
      entryNodeId: "node:researcher",
      entryNodeName: "Researcher",
      providerFallback: false,
      providerFallbackBlocked: true,
      providerFallbackBlockedReasonCode: "provider_direct_blocked_without_explicit_target",
      selectedExecutorIds: ["node:researcher", "node:reviewer"],
      selectedEdgeIds: ["relation:researcher-reviewer"],
      assignedTopologyAgentIds: ["workspace:draft:node:researcher"],
      issues: [],
    },
    plan: {
      planId: "plan:task024",
      directTaskCount: 0,
      delegatedTaskCount: 1,
      approvalRequirementCount: 1,
      resourceLockCount: 0,
      parallelGroupCount: 0,
      fallbackMode: "single_knowbee",
      fallbackReasonCode: "fallback_if_agent_unavailable",
      taskSummaries: [
        {
          taskId: "task:research",
          executionKind: "delegated_sub_agent",
          goal: "Inspect runtime projection",
          assignedAgentId: "agent:researcher",
          assignmentSource: "agent",
          reasonCodes: ["task024"],
        },
      ],
    },
    subSessions: [
      {
        subSessionId: "sub:running",
        parentRunId: "run:task024",
        agentId: "agent:researcher",
        agentName: "Researcher",
        agentNameSnapshot: "Researcher",
        status: "running",
        commandSummary: "Inspect runtime projection",
        expectedOutputs: [
          {
            outputId: "answer",
            kind: "text",
            required: true,
            description: "Evidence-backed answer",
            acceptanceReasonCodes: ["source_backed_answer"],
          },
        ],
        promptBundleId: "bundle:researcher",
        startedAt: now,
        progress: [
          {
            eventId: "event:progress",
            at: now + 1,
            status: "running",
            summary: "Gathering sources",
          },
        ],
        feedback: { status: "none" },
        approvalState: "pending",
        model: {
          providerId: "openai",
          modelId: "gpt-5.4-mini",
          fallbackApplied: false,
          signalCount: 1,
          estimatedInputTokens: 120,
          estimatedOutputTokens: 64,
          estimatedCost: 0.002,
          latencyMs: 350,
        },
        allowedControlActions: [
          { action: "send", reasonCode: "sub_session_active_control_allowed" },
          { action: "steer", reasonCode: "sub_session_active_control_allowed" },
          { action: "kill", reasonCode: "sub_session_active_control_allowed" },
        ],
      },
      {
        subSessionId: "sub:revision",
        parentRunId: "run:task024",
        agentId: "agent:reviewer",
        agentName: "Reviewer",
        agentNameSnapshot: "Reviewer",
        status: "needs_revision",
        commandSummary: "Review answer",
        expectedOutputs: [],
        promptBundleId: "bundle:reviewer",
        progress: [],
        result: {
          status: "needs_revision",
          outputCount: 1,
          artifactCount: 0,
          riskOrGapCount: 1,
          risksOrGaps: ["source gap"],
        },
        review: {
          status: "needs_revision",
          verdict: "insufficient_evidence",
          parentIntegrationStatus: "blocked_insufficient_evidence",
          accepted: false,
          issueCodes: ["missing_evidence"],
          normalizedFailureKey: "blocked_insufficient_evidence",
          risksOrGaps: [],
        },
        feedback: {
          status: "requested",
          reasonCode: "blocked_insufficient_evidence",
          missingItemCount: 1,
          requiredChangeCount: 1,
        },
        approvalState: "not_required",
        allowedControlActions: [
          { action: "retry", reasonCode: "sub_session_retry_state_allowed" },
          { action: "feedback", reasonCode: "sub_session_feedback_state_allowed" },
          { action: "redelegate", reasonCode: "sub_session_feedback_state_allowed" },
        ],
      },
    ],
    dataExchanges: [
      {
        exchangeId: "exchange:task024",
        sourceOwnerId: "agent:researcher",
        sourceAgentName: "Researcher",
        sourceAgentNameSnapshot: "Researcher",
        recipientOwnerId: "agent:reviewer",
        recipientAgentName: "Reviewer",
        recipientAgentNameSnapshot: "Reviewer",
        purpose: "Share redacted research summary",
        allowedUse: "temporary_context",
        retentionPolicy: "session_only",
        redactionState: "redacted",
        provenanceCount: 1,
        createdAt: now,
      },
    ],
    approvals: [
      {
        approvalId: "approval:task024",
        status: "pending",
        subSessionId: "sub:running",
        agentId: "agent:researcher",
        summary: "external source required",
        at: now,
      },
    ],
    timeline: [
      {
        id: "event:reviewed",
        at: now,
        source: "orchestration",
        kind: "result_reviewed",
        summary: "reviewed",
        subSessionId: "sub:revision",
      },
    ],
    topologyRuns: [],
    finalizer: {
      parentOwnedFinalAnswer: true,
      status: "delivered",
      deliveryKey: "webui:final:task024",
      summary: "parent finalizer delivered once",
      at: now,
    },
    redaction: {
      payloadsRedacted: true,
      rawPayloadVisible: false,
    },
  }
}

describe("task024 webui runtime inspector helpers", () => {
  it("labels canonical and legacy direct main-agent runtime modes without exposing raw mode names", () => {
    expect(runtimeOrchestrationModeLabel("direct_main_agent", text)).toBe("메인 에이전트 직접 처리")
    expect(runtimeOrchestrationModeLabel("single_knowbee", text)).toBe("메인 에이전트 직접 처리")
    expect(runtimeOrchestrationModeLabel("orchestration", text)).toBe("서브 에이전트 위임")
  })

  it("uses sub-agent relationship wording for direct-child validation status", () => {
    const label = runtimeValidationStatusLabel("selected_executor_not_direct_child", text)

    expect(label).toBe("선택된 서브 에이전트가 현재 서브 에이전트의 직속 서브 에이전트가 아님")
    expect(label).not.toContain("직접 하위")
  })

  it("selects sub-sessions and summarizes runtime projection state", () => {
    const runtime = projection()
    const selected = selectRuntimeSubSession(runtime, "sub:revision")
    const cards = buildRuntimeInspectorSummaryCards(runtime, text)

    expect(selected?.agentName).toBe("Reviewer")
    expect(selected?.review?.parentIntegrationStatus).toBe("blocked_insufficient_evidence")
    expect(cards.find((card) => card.id === "mode")?.value).toBe("서브 에이전트 위임")
    expect(cards.find((card) => card.id === "subsessions")?.tone).toBe("amber")
    expect(cards.find((card) => card.id === "data")?.value).toBe("1")
    expect(cards.find((card) => card.id === "topology")?.value).toBe("Researcher")
    expect(describeRuntimeFinalizerStatus(runtime, text)).toBe("최종 답변 전달 완료")
  })

  it("labels approval states and only exposes controls supplied by the server policy", () => {
    const runtime = projection()
    const running = selectRuntimeSubSession(runtime, "sub:running")
    const revision = selectRuntimeSubSession(runtime, "sub:revision")

    expect(describeRuntimeApprovalState(running?.approvalState ?? "not_required", text)).toBe(
      "승인 대기",
    )
    expect(runtimeControlActionLabels(running, text)).toEqual(["전송", "방향 조정", "중지"])
    expect(runtimeControlActionLabels(revision, text)).toEqual(["재시도", "피드백", "재위임"])
  })

  it("renders sub-session labels as one canonical agent name", () => {
    const runtime = projection()
    ;(runtime.subSessions[0]! as typeof runtime.subSessions[number] & {
      agentDisplayName: string
    }).agentDisplayName = "Legacy Display Name"
    runtime.subSessions[0]!.agentName = "Canonical Agent Name"
    runtime.subSessions[0]!.agentNameSnapshot = "Snapshot Agent Name"

    const html = renderToStaticMarkup(
      createElement(RunRuntimeInspectorPanel, {
        projection: runtime,
        selectedSubSessionId: "sub:running",
        onSelectSubSession: () => undefined,
        loading: false,
        error: "",
      }),
    )

    expect(runtimeSubSessionAgentName(runtime.subSessions[0]!)).toBe("Canonical Agent Name")
    expect(html).toContain("Canonical Agent Name")
    expect(html).not.toContain("Snapshot Agent Name")
    expect(html).not.toContain("Legacy Display Name")
  })

  it("does not use legacy sub-session display names or internal ids as fallback labels", () => {
    expect(runtimeSubSessionAgentName({
      agentId: "agent:internal-id",
    })).toBe("Unnamed sub-agent")
  })

  it("describes topology routing and exposes active node/edge state for the topology canvas", () => {
    const runtime = projection()
    const activeState = selectRuntimeTopologyActiveState(runtime)

    expect(describeRuntimeTopologyRouting(runtime.topologyRouting, text)).toContain("Researcher")
    expect(runtime.topologyRouting.executionDecisionRoute).toBe("delegate_to_child")
    expect(runtime.topologyRouting.executionDecisionFallbackReason).toBe("self_solve")
    expect(runtimeExecutorDisplayName(runtime.topologyRouting, "workspace:draft:node:researcher")).toBe("Researcher")
    expect(runtimeExecutorDisplayName(runtime.topologyRouting, "agent:knowbee")).toBe("노비")
    expect(runtimeExecutorRoleName(runtime.topologyRouting, "workspace:draft:node:researcher")).toBe("시장 분석 실행자")
    expect(runtime.topologyRouting.riskBoundaryRequiresUserApproval).toBe(false)
    expect(runtime.topologyRouting.executionDecisionCurrentExecutorId).toBe("agent:knowbee")
    expect(runtime.topologyRouting.executionDecisionAvailableExecutorIds).toEqual(["workspace:draft:node:researcher"])
    expect(runtime.topologyRouting.executionDecisionAllExecutorIds).toContain("workspace:draft:node:reviewer")
    expect(runtime.topologyRouting.executionDecisionNormalizedConnectionPath).toEqual([
      "agent:knowbee",
      "workspace:draft:node:researcher",
    ])
    expect(runtime.topologyRouting.topologySchemaVersion).toBe(2)
    expect(runtime.topologyRouting.topologyMigrationSource).toBe("executor_topology_v2_materialized_read_model")
    expect(runtime.topologyRouting.providerFallbackBlocked).toBe(true)
    expect(activeState.executorIds).toEqual(["node:researcher", "node:reviewer"])
    expect(activeState.edgeIds).toEqual(["relation:researcher-reviewer"])
    expect(activeState.executorStatuses["node:researcher"]).toBe("running")
    expect(activeState.edgeStatuses["relation:researcher-reviewer"]).toBe("running")
  })

  it("builds a basic inspector view with executor names while moving raw ids to diagnostics", () => {
    const runtime = projection()
    const viewModels = buildRuntimeInspectorViewModels(runtime, text)

    expect(viewModels.basic.currentExecutorName).toBe("노비")
    expect(viewModels.basic.selectedExecutorName).toBe("Researcher")
    expect(viewModels.basic.selectedExecutorRoleName).toBe("시장 분석 실행자")
    expect(viewModels.basic.selectedPathNames).toEqual(["노비", "Researcher"])
    expect(viewModels.basic.delegationStatus).toBe("하위 서브 에이전트에게 위임")
    expect(viewModels.basic.aggregationStatus).toBe("최종 답변 전달 완료")
    expect(viewModels.diagnostic.identity.map((item) => item.label)).toEqual(expect.arrayContaining([
      "실행",
      "요청 그룹",
      "최상위 실행",
    ]))
    expect(viewModels.diagnostic.routing.map((item) => item.label)).toEqual(expect.arrayContaining([
      "위임 구조",
      "위임 구조 출처",
      "위임 흐름 ID",
      "위임 흐름 출처",
    ]))
    expect(viewModels.diagnostic.identity.map((item) => item.value)).toContain("group:task024")
    expect(viewModels.diagnostic.executorIds.find((item) => item.id === "selected")?.values).toEqual([
      "workspace:draft:node:researcher",
    ])
  })

  it("uses the configured root executor name for direct root route labels", () => {
    const runtime = projection()
    runtime.topologyRouting.executionDecisionRoute = "root_knowbee_direct"
    runtime.topologyRouting.executionDecisionExecutorNameById["agent:knowbee"] = "마당쇠"
    const viewModels = buildRuntimeInspectorViewModels(runtime, text)

    expect(viewModels.basic.delegationStatus).toBe("마당쇠가 직접 처리")
    expect(viewModels.basic.delegationStatus).not.toBe("노비가 직접 처리")
  })

  it("uses the configured root executor name for direct fallback labels", () => {
    const runtime = projection()
    runtime.topologyRouting.executionDecisionFallbackReason = "root_knowbee_direct"
    runtime.topologyRouting.executionDecisionExecutorNameById["agent:knowbee"] = "마당쇠"
    const viewModels = buildRuntimeInspectorViewModels(runtime, text)

    expect(viewModels.basic.routingPills).toContain("대안 마당쇠가 처리")
    expect(viewModels.basic.routingPills.join(" ")).not.toContain("노비가 처리")
  })

  it("renders decision names in the basic view and keeps internal ids in diagnostics", () => {
    const runtime = projection()
    runtime.topologyRouting.reasonCode = "topology_routing_not_opted_in"
    const html = renderToStaticMarkup(
      createElement(RunRuntimeInspectorPanel, {
        projection: runtime,
        selectedSubSessionId: null,
        onSelectSubSession: () => undefined,
        loading: false,
        error: "",
      }),
    )

    const diagnosticStart = html.indexOf("진단 정보")
    const rawExecutorStart = html.indexOf("workspace:draft:node:researcher")
    const rawReasonStart = html.indexOf("topology_routing_not_opted_in")
    const migrationSourceStart = html.indexOf("executor_topology_v2_materialized_read_model")

    expect(runtimeTopologyReasonLabel("topology_routing_not_opted_in", text)).toBe("저장된 위임 흐름을 쓰지 않음")
    expect(html).toContain("메인 에이전트 실행 판단")
    expect(html).toContain("실행 흐름")
    expect(html).toContain("진단 정보")
    expect(html).toContain("판단 후보 내부 식별자")
    expect(html).toContain("등록된 내부 식별자")
    expect(html).toContain("선택된 서브 에이전트")
    expect(html).toContain("시장 분석 실행자")
    expect(html).toContain("Researcher")
    expect(html).toContain("Reviewer")
    expect(html).toContain("노비")
    expect(html).toContain("위임 흐름")
    expect(html).toContain("구성 형식")
    expect(html).toContain("최종 답변 전달 완료")
    expect(html).toContain("executor_topology_v2_materialized_read_model")
    expect(html).toContain("직접 실행 대안 차단됨")
    expect(diagnosticStart).toBeGreaterThan(0)
    expect(rawExecutorStart).toBeGreaterThan(diagnosticStart)
    expect(rawReasonStart).toBeGreaterThan(diagnosticStart)
    expect(migrationSourceStart).toBeGreaterThan(diagnosticStart)
    expect(html).not.toContain("provider_direct_blocked_without_explicit_target")
    expect(html).not.toContain("parent finalizer")
    expect(html).not.toContain("orchestration</div>")
    expect(html).not.toContain("라우터")
  })

  it("handles empty projection without throwing", () => {
    expect(selectRuntimeSubSession(null, "missing")).toBeNull()
    expect(buildRuntimeInspectorSummaryCards(null, text)[0].value).toBe("불러오는 중")
  })
})
