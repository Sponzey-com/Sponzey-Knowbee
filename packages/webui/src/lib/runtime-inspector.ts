import type {
  RunRuntimeInspectorProjection,
  RunRuntimeInspectorSubSession,
  RunRuntimeInspectorTopologyRouting,
  RuntimeInspectorApprovalState,
  RuntimeInspectorControlAction,
} from "../contracts/runs"
import { DEFAULT_MAIN_AGENT_NAME_EN, DEFAULT_MAIN_AGENT_NAME_KO } from "./main-agent-copy"

export interface RuntimeInspectorSummaryCard {
  id: string
  label: string
  value: string
  tone: "stone" | "blue" | "emerald" | "amber" | "rose"
}

export interface RuntimeTopologyActiveState {
  executorIds: string[]
  edgeIds: string[]
  executorStatuses: Record<string, "running">
  edgeStatuses: Record<string, "running">
}

export interface RuntimeInspectorKeyValue {
  id: string
  label: string
  value: string
}

export interface RuntimeInspectorListValue {
  id: string
  label: string
  values: string[]
}

export interface RuntimeInspectorBasicViewModel {
  topologyLabel: string
  routingMode: string
  routingTone: "route" | "fallback" | "unknown"
  routingSummary: string
  routingPills: string[]
  currentExecutorName: string
  selectedExecutorName: string
  selectedExecutorRoleName?: string
  selectedPathNames: string[]
  delegationStatus: string
  aggregationStatus: string
  validationStatus: string
  warningLabels: string[]
}

export interface RuntimeInspectorDiagnosticViewModel {
  identity: RuntimeInspectorKeyValue[]
  routing: RuntimeInspectorKeyValue[]
  executorIds: RuntimeInspectorListValue[]
  providerFallbackLabel: string
  issues: string[]
}

export interface RuntimeInspectorViewModels {
  basic: RuntimeInspectorBasicViewModel
  diagnostic: RuntimeInspectorDiagnosticViewModel
}

export function selectRuntimeSubSession(
  projection: RunRuntimeInspectorProjection | null,
  selectedSubSessionId: string | null,
): RunRuntimeInspectorSubSession | null {
  if (!projection || projection.subSessions.length === 0) return null
  return (
    projection.subSessions.find((item) => item.subSessionId === selectedSubSessionId) ??
    projection.subSessions[0] ??
    null
  )
}

export function describeRuntimeApprovalState(
  state: RuntimeInspectorApprovalState,
  text: (ko: string, en: string) => string,
): string {
  switch (state) {
    case "approved":
      return text("승인 완료", "Approved")
    case "denied":
      return text("승인 거절", "Denied")
    case "pending":
      return text("승인 대기", "Pending approval")
    case "required":
      return text("승인 필요", "Approval required")
    case "not_required":
      return text("승인 불필요", "No approval required")
  }
}

export function describeRuntimeFinalizerStatus(
  projection: RunRuntimeInspectorProjection | null,
  text: (ko: string, en: string) => string,
): string {
  switch (projection?.finalizer.status) {
    case "delivered":
      return text("최종 답변 전달 완료", "Final answer delivered")
    case "generated":
      return text("최종 답변 생성 완료", "Final answer generated")
    case "suppressed":
      return text("최종 답변 전달하지 않음", "Final answer suppressed")
    case "failed":
      return text("최종 답변 전달 실패", "Final answer failed")
    default:
      return text("최종 답변 정리 대기", "Final answer pending")
  }
}

export function runtimeFinalizerSummary(
  projection: RunRuntimeInspectorProjection | null,
  text: (ko: string, en: string) => string,
): string {
  const summary = projection?.finalizer.summary?.trim()
  if (summary && !/parent finalizer/i.test(summary)) return summary
  switch (projection?.finalizer.status) {
    case "delivered":
      return text("최종 답변이 사용자에게 한 번 전달되었습니다.", "The final answer was delivered to the user once.")
    case "generated":
      return text("최종 답변이 생성되었고 전달 전 상태입니다.", "The final answer was generated and is waiting for delivery.")
    case "suppressed":
      return text("정책 또는 상태 조건 때문에 최종 답변 전달을 막았습니다.", "Final answer delivery was suppressed by policy or state.")
    case "failed":
      return text("최종 답변 전달 중 문제가 발생했습니다.", "Final answer delivery failed.")
    default:
      return text(
        "최종 답변은 최종 답변 정리 단계에서만 사용자에게 전달합니다.",
        "Only the final response step delivers the final answer to the user.",
      )
  }
}

export function runtimeOrchestrationModeLabel(
  mode: string | undefined,
  text: (ko: string, en: string) => string,
): string {
  switch (mode) {
    case "orchestration":
      return text("서브 에이전트 위임", "Sub-agent delegation")
    case "direct_main_agent":
    case "single_knowbee":
      return text("메인 에이전트 직접 처리", "Main-agent direct handling")
    default:
      return text("실행 모드 확인 필요", "Execution mode needs review")
  }
}

export function runtimeControlActionLabel(
  action: RuntimeInspectorControlAction,
  text: (ko: string, en: string) => string,
): string {
  switch (action) {
    case "send":
      return text("전송", "Send")
    case "steer":
      return text("방향 조정", "Steer")
    case "retry":
      return text("재시도", "Retry")
    case "feedback":
      return text("피드백", "Feedback")
    case "redelegate":
      return text("재위임", "Redelegate")
    case "cancel":
      return text("취소", "Cancel")
    case "kill":
      return text("중지", "Kill")
  }
}

export function runtimeControlActionLabels(
  subSession: RunRuntimeInspectorSubSession | null,
  text: (ko: string, en: string) => string,
): string[] {
  return (subSession?.allowedControlActions ?? []).map((item) =>
    runtimeControlActionLabel(item.action, text),
  )
}

export function runtimeSubSessionAgentName(
  subSession:
    | (Pick<RunRuntimeInspectorSubSession, "agentId"> &
        Partial<Pick<RunRuntimeInspectorSubSession, "agentName" | "agentNameSnapshot">>)
    | null
    | undefined,
): string {
  return subSession?.agentName?.trim() || subSession?.agentNameSnapshot?.trim() || "Unnamed sub-agent"
}

export function describeRuntimeTopologyRouting(
  routing: RunRuntimeInspectorTopologyRouting | null | undefined,
  text: (ko: string, en: string) => string,
): string {
  if (!routing || routing.mode === "unknown") {
    return text("실행 판단 정보가 아직 없습니다.", "No execution decision information yet.")
  }
  if (routing.mode === "route") {
    const selectedExecutorName = routing.executionDecisionSelectedExecutorId
      ? runtimeExecutorDisplayName(routing, routing.executionDecisionSelectedExecutorId)
      : undefined
    const target =
      routing.entryNodeName ??
      selectedExecutorName ??
      routing.topologyName ??
      text("선택된 서브 에이전트", "the selected sub-agent")
    return text(
      `서브 에이전트 위임 흐름은 ${target}에서 시작합니다.`,
      `The sub-agent delegation flow starts with ${target}.`,
    )
  }
  if (routing.reasonCode === "feature_flag_off") {
    return text(
      "관리자가 저장된 서브 에이전트 위임 흐름을 꺼서 직접 실행으로 전환되었습니다.",
      "Saved sub-agent delegation was disabled by an administrator, so the run fell back.",
    )
  }
  if (routing.reasonCode === "active_topology_not_found" || routing.reasonCode === "topology_not_found") {
    return text(
      "저장된 서브 에이전트 실행 구성을 찾지 못해 직접 실행으로 전환되었습니다.",
      "No saved sub-agent execution setup was found, so the run fell back.",
    )
  }
  if (routing.reasonCode === "topology_validation_blocked") {
    return text(
      "서브 에이전트 구성 검증 문제가 있어 실행 전에 차단되었습니다.",
      "Sub-agent setup validation blocked execution before the path was selected.",
    )
  }
  if (routing.reasonCode === "entry_node_missing") {
    return text(
      "실행을 시작할 서브 에이전트가 없어 직접 실행으로 전환되었습니다.",
      "No entry sub-agent was available, so the run fell back.",
    )
  }
  if (routing.reasonCode === "non_root_request") {
    return text(
      "이미 진행 중인 하위 요청이라 새 최상위 위임 흐름을 만들지 않았습니다.",
      "This was a child request, so no new top-level delegation flow was created.",
    )
  }
  return text(
    `${runtimeTopologyReasonLabel(routing.reasonCode, text)} 상태라 기본 처리로 전환되었습니다.`,
    `The execution path fell back: ${runtimeTopologyReasonLabel(routing.reasonCode, text)}.`,
  )
}

export function runtimeTopologyReasonLabel(
  reasonCode: string | undefined,
  text: (ko: string, en: string) => string,
): string {
  switch (reasonCode) {
    case "topology_routing_not_opted_in":
      return text("저장된 위임 흐름을 쓰지 않음", "Saved delegation flow was not used")
    case "provider_direct_blocked_without_explicit_target":
      return text("명시적 요청 없는 직접 실행 차단", "Direct execution blocked without explicit request")
    case "feature_flag_off":
      return text("저장된 위임 흐름 꺼짐", "Saved delegation flow disabled")
    case "active_topology_not_found":
    case "topology_not_found":
      return text("저장된 서브 에이전트 구성 없음", "No saved sub-agent setup")
    case "topology_validation_blocked":
      return text("구성 검증 차단", "Setup validation blocked execution")
    case "entry_node_missing":
      return text("시작 서브 에이전트 없음", "No entry sub-agent")
    case "selected_executor_missing":
      return text("선택된 서브 에이전트 없음", "No selected sub-agent")
    case "execution_decision_selected_executor":
      return text("검증된 서브 에이전트 선택", "Validated sub-agent selection")
    case "explicit_topology_target":
      return text("명시된 실행 구성 대상", "Explicit execution setup target")
    case "non_root_request":
      return text("이미 진행 중인 하위 요청", "Already a child request")
    case "execution_decision_validated":
      return text("실행 판단 검증 완료", "Execution decision validated")
    case "plan_snapshot_reconciled_with_execution_decision_trace":
      return text("실제 실행 trace 기준으로 표시", "Displayed from the actual execution trace")
    case "legacy_single_knowbee_fallback_mode_deprecated":
      return text("이전 직접 실행 계획 감지", "Legacy direct-execution plan detected")
    case undefined:
      return text("실행 판단 정보 없음", "No execution decision details")
    default:
      return text("기본 처리로 전환", "Fell back to default handling")
  }
}

export function runtimeExecutorDisplayName(
  routing: RunRuntimeInspectorTopologyRouting | null | undefined,
  executorId: string | undefined,
): string {
  const normalized = executorId?.trim()
  if (!normalized) return ""
  return routing?.executionDecisionExecutorNameById?.[normalized] ?? ""
}

export function runtimeExecutorRoleName(
  routing: RunRuntimeInspectorTopologyRouting | null | undefined,
  executorId: string | undefined,
): string {
  const normalized = executorId?.trim()
  if (!normalized) return ""
  return routing?.executionDecisionExecutorRoleNameById?.[normalized] ?? ""
}

function runtimeExecutorDisplayNames(
  routing: RunRuntimeInspectorTopologyRouting | null | undefined,
  executorIds: string[] | undefined,
): string[] {
  return [...new Set((executorIds ?? [])
    .map((executorId) => runtimeExecutorDisplayName(routing, executorId))
    .filter((value) => value.trim().length > 0))]
}

export function runtimeDecisionSourceLabel(
  source: string | undefined,
  text: (ko: string, en: string) => string,
): string {
  if (!source) return text("판단 정보 없음", "No decision source")
  if (source === "knowbee_harness") return text("메인 에이전트 실행 판단", "Main-agent execution decision")
  return text("실행 판단", "Execution decision")
}

export function runtimeExecutionRouteLabel(
  route: string | undefined,
  text: (ko: string, en: string) => string,
  rootAgentName?: string,
): string {
  switch (route) {
    case "delegate_to_child":
      return text("하위 서브 에이전트에게 위임", "Delegate to child sub-agent")
    case "self_solve":
    case "direct_current_agent":
      return text("현재 서브 에이전트가 직접 처리", "Current sub-agent handles it")
    case "root_knowbee_direct":
    case "knowbee_direct":
      return rootAgentName?.trim()
        ? text(`${rootAgentName.trim()}가 직접 처리`, `${rootAgentName.trim()} handles it`)
        : text("메인 에이전트가 직접 처리", "Main agent handles it")
    case "return_to_parent":
      return text("상위 서브 에이전트에게 반환", "Return to parent sub-agent")
    case "ask_parent":
      return text("상위 서브 에이전트 확인", "Ask parent sub-agent")
    case "ask_user":
      return text("사용자 확인", "Ask user")
    case "explicit_provider":
      return text("명시적 직접 실행", "Explicit direct execution")
    case "sub_agent":
      return text("서브 에이전트 실행", "Sub-agent execution")
    case "yeonjang":
      return text("연장 실행", "Yeonjang execution")
    case undefined:
      return text("위임 흐름 미정", "Delegation flow unknown")
    default:
      return text("위임 흐름", "Delegation flow")
  }
}

export function runtimeFallbackReasonLabel(
  reason: string | undefined,
  text: (ko: string, en: string) => string,
  rootAgentName?: string,
): string {
  switch (reason) {
    case "self_solve":
    case "direct_current_agent":
      return text("현재 서브 에이전트가 처리", "Current sub-agent handles it")
    case "delegate_to_child":
      return text("가능한 하위 서브 에이전트에게 위임", "Delegate to an available child sub-agent")
    case "return_to_parent":
      return text("상위 서브 에이전트에게 반환", "Return to parent sub-agent")
    case "ask_parent":
      return text("상위 서브 에이전트 확인", "Ask parent sub-agent")
    case "ask_user":
      return text("사용자 확인", "Ask user")
    case "root_knowbee_direct":
    case "knowbee_direct":
      return rootAgentName?.trim()
        ? text(`${rootAgentName.trim()}가 처리`, `${rootAgentName.trim()} handles it`)
        : text("메인 에이전트가 처리", "Main agent handles it")
    case "explicit_provider":
      return text("명시적 직접 실행", "Explicit direct execution")
    case undefined:
      return text("대안 없음", "No fallback")
    default:
      return runtimeTopologyReasonLabel(reason, text)
  }
}

export function runtimeValidationStatusLabel(
  status: string | undefined,
  text: (ko: string, en: string) => string,
): string {
  switch (status) {
    case "valid":
      return text("검증 통과", "Validation passed")
    case "selected_executor_not_direct_child":
      return text("선택된 서브 에이전트가 현재 서브 에이전트의 직속 서브 에이전트가 아님", "Selected sub-agent is not an immediate sub-agent")
    case "selected_executor_not_in_graph":
      return text("선택된 서브 에이전트가 그래프에 없음", "Selected sub-agent is not in the graph")
    case "selected_connection_path_invalid":
    case "inaccessible_connection_path":
      return text("선택된 연결 경로를 사용할 수 없음", "Selected connection path is not usable")
    case "executor_unavailable":
      return text("선택된 서브 에이전트를 사용할 수 없음", "Selected sub-agent is unavailable")
    case "risk_boundary_requires_approval":
      return text("최종 검토가 필요한 위험 경계", "Risk boundary needs final review")
    case "fallback_not_allowed":
      return text("선택한 대안 경로를 사용할 수 없음", "Selected fallback path is not allowed")
    case undefined:
      return text("검증 정보 없음", "No validation status")
    default:
      return text("검증 실패", "Validation failed")
  }
}

export function selectRuntimeTopologyActiveState(
  projection: RunRuntimeInspectorProjection | null,
): RuntimeTopologyActiveState {
  const executorIds = [...new Set(projection?.topologyRouting.selectedExecutorIds ?? [])]
  const edgeIds = [...new Set(projection?.topologyRouting.selectedEdgeIds ?? [])]
  return {
    executorIds,
    edgeIds,
    executorStatuses: executorIds.reduce<Record<string, "running">>((statuses, executorId) => {
      statuses[executorId] = "running"
      return statuses
    }, {}),
    edgeStatuses: edgeIds.reduce<Record<string, "running">>((statuses, edgeId) => {
      statuses[edgeId] = "running"
      return statuses
    }, {}),
  }
}

export function buildRuntimeInspectorViewModels(
  projection: RunRuntimeInspectorProjection | null,
  text: (ko: string, en: string) => string,
): RuntimeInspectorViewModels {
  if (!projection) {
    return {
      basic: {
        topologyLabel: text("불러오는 중", "Loading"),
        routingMode: "unknown",
        routingTone: "unknown",
        routingSummary: text("실행 판단 정보가 아직 없습니다.", "No execution decision information yet."),
        routingPills: [],
        currentExecutorName: text("정보 없음", "Unknown"),
        selectedExecutorName: text("선택 전", "Not selected"),
        selectedPathNames: [],
        delegationStatus: text("실행 판단 정보가 아직 없습니다.", "No execution decision information yet."),
        aggregationStatus: text("최종 답변 정리 대기", "Final response pending"),
        validationStatus: text("검증 정보 없음", "No validation status"),
        warningLabels: [],
      },
      diagnostic: {
        identity: [],
        routing: [],
        executorIds: [],
        providerFallbackLabel: text("직접 실행 대안 미사용", "Direct execution fallback unused"),
        issues: [],
      },
    }
  }

  const routing = projection.topologyRouting
  const selectedExecutorId = routing.executionDecisionSelectedExecutorId ?? routing.entryNodeId
  const selectedPath =
    routing.executionDecisionNormalizedConnectionPath?.length
      ? routing.executionDecisionNormalizedConnectionPath
      : routing.executionDecisionSelectedConnectionPath?.length
        ? routing.executionDecisionSelectedConnectionPath
        : routing.selectedExecutorIds
  const warningLabels = [
    ...(projection.plan.fallbackWarnings ?? []),
    ...routing.issues,
    ...(routing.executionDecisionValidationIssues ?? []),
  ].map((issue) => runtimeTopologyReasonLabel(issue, text))
  const routingPills = [
    routing.topologyName ?? (routing.topologyId ? text("저장된 구성", "Saved setup") : undefined),
    routing.entryNodeName ?? runtimeExecutorDisplayName(routing, routing.entryNodeId),
    routing.topologySchemaVersion !== undefined
      ? text(`구성 형식 v${routing.topologySchemaVersion}`, `Setup format v${routing.topologySchemaVersion}`)
      : undefined,
    routing.reasonCode ? runtimeTopologyReasonLabel(routing.reasonCode, text) : undefined,
    routing.executionDecisionSource ? runtimeDecisionSourceLabel(routing.executionDecisionSource, text) : undefined,
    routing.executionDecisionRoute
      ? `${text("위임 흐름", "Delegation flow")} ${runtimeExecutionRouteLabel(
          routing.executionDecisionRoute,
          text,
          runtimeExecutorDisplayName(routing, "agent:knowbee"),
        )}`
      : undefined,
    routing.executionDecisionFallbackReason
      ? `${text("대안", "Fallback")} ${runtimeFallbackReasonLabel(
          routing.executionDecisionFallbackReason,
          text,
          runtimeExecutorDisplayName(routing, "agent:knowbee"),
        )}`
      : undefined,
    routing.riskBoundaryRequiresUserApproval !== undefined
      ? routing.riskBoundaryRequiresUserApproval
        ? text("검토 필요", "Review needed")
        : text("검토 불필요", "No review")
      : undefined,
    routing.riskBoundaryKind ? `${text("위험", "Risk")} ${routing.riskBoundaryKind}` : undefined,
    routing.providerFallback ? text("직접 실행 대안 사용", "Direct execution fallback used") : undefined,
    routing.providerFallbackBlocked
      ? runtimeTopologyReasonLabel(routing.providerFallbackBlockedReasonCode, text)
      : undefined,
    routing.selectedExecutorIds.length > 0
      ? `${text("서브 에이전트", "Sub-agents")} ${routing.selectedExecutorIds.length}`
      : undefined,
    routing.selectedEdgeIds.length > 0
      ? `${text("연결선", "Edges")} ${routing.selectedEdgeIds.length}`
      : undefined,
  ].filter((value): value is string => Boolean(value?.trim()))
  const providerFallbackLabel = routing.providerFallbackBlocked
    ? text("직접 실행 대안 차단됨", "Direct execution fallback blocked")
    : routing.providerFallback
      ? text("직접 실행 대안 사용됨", "Direct execution fallback used")
      : text("직접 실행 대안 미사용", "Direct execution fallback unused")

  return {
    basic: {
      topologyLabel: routing.topologyName ?? routing.topologyId ?? text("업무 흐름", "Workflow"),
      routingMode: routing.mode,
      routingTone: routing.mode === "route" || routing.mode === "fallback" ? routing.mode : "unknown",
      routingSummary: describeRuntimeTopologyRouting(routing, text),
      routingPills,
      currentExecutorName: runtimeExecutorDisplayName(routing, routing.executionDecisionCurrentExecutorId) ||
        text(DEFAULT_MAIN_AGENT_NAME_KO, DEFAULT_MAIN_AGENT_NAME_EN),
      selectedExecutorName:
        runtimeExecutorDisplayName(routing, selectedExecutorId) ||
        routing.entryNodeName ||
        text("선택 전", "Not selected"),
      ...(runtimeExecutorRoleName(routing, selectedExecutorId)
        ? { selectedExecutorRoleName: runtimeExecutorRoleName(routing, selectedExecutorId) }
        : {}),
      selectedPathNames: runtimeExecutorDisplayNames(routing, selectedPath),
      delegationStatus:
        routing.mode === "route"
          ? runtimeExecutionRouteLabel(
              routing.executionDecisionRoute,
              text,
              runtimeExecutorDisplayName(routing, "agent:knowbee"),
            )
          : describeRuntimeTopologyRouting(routing, text),
      aggregationStatus: describeRuntimeFinalizerStatus(projection, text),
      validationStatus: runtimeValidationStatusLabel(routing.executionDecisionValidationStatus, text),
      warningLabels,
    },
    diagnostic: {
      identity: [
        { id: "run", label: text("실행", "Run"), value: projection.requestIdentity.runId },
        { id: "request-group", label: text("요청 그룹", "Request group"), value: projection.requestIdentity.requestGroupId },
        { id: "root-run", label: text("최상위 실행", "Root run"), value: projection.requestIdentity.rootRunId },
        ...(projection.requestIdentity.userMessageKey
          ? [{ id: "user-message", label: text("사용자 메시지", "User message"), value: projection.requestIdentity.userMessageKey }]
          : []),
      ],
      routing: [
        ...(routing.reasonCode ? [{ id: "reason", label: text("사유 코드", "Reason code"), value: routing.reasonCode }] : []),
        ...(routing.executionDecisionSource ? [{ id: "source", label: text("판단 출처", "Decision source"), value: routing.executionDecisionSource }] : []),
        ...(routing.executionDecisionGraphId ? [{ id: "graph", label: text("위임 구조", "Delegation graph"), value: routing.executionDecisionGraphId }] : []),
        ...(routing.executionDecisionGraphSource ? [{ id: "graph-source", label: text("위임 구조 출처", "Delegation graph source"), value: routing.executionDecisionGraphSource }] : []),
        ...(routing.executionDecisionRoute ? [{ id: "route", label: text("실행 경로", "Execution route"), value: routing.executionDecisionRoute }] : []),
        ...(routing.executionDecisionFallbackReason ? [{ id: "fallback", label: text("대안", "Fallback"), value: routing.executionDecisionFallbackReason }] : []),
        ...(routing.topologyId ? [{ id: "topology-id", label: text("위임 흐름 ID", "Delegation flow ID"), value: routing.topologyId }] : []),
        ...(routing.topologyMigrationSource ? [{ id: "migration-source", label: text("위임 흐름 출처", "Delegation flow source"), value: routing.topologyMigrationSource }] : []),
      ],
      executorIds: [
        {
          id: "current",
          label: text("현재 내부 식별자", "Current internal identifier"),
          values: routing.executionDecisionCurrentExecutorId ? [routing.executionDecisionCurrentExecutorId] : [],
        },
        {
          id: "available",
          label: text("판단 후보 내부 식별자", "Candidate internal identifiers"),
          values: routing.executionDecisionAvailableExecutorIds ?? [],
        },
        {
          id: "registered",
          label: text("등록된 내부 식별자", "Registered internal identifiers"),
          values: routing.executionDecisionAllRegisteredExecutorIds ?? routing.executionDecisionAllExecutorIds ?? [],
        },
        {
          id: "selected",
          label: text("선택된 내부 식별자", "Selected internal identifier"),
          values: routing.executionDecisionSelectedExecutorId ? [routing.executionDecisionSelectedExecutorId] : [],
        },
        {
          id: "path",
          label: text("선택 경로 내부 식별자", "Selected path internal identifiers"),
          values: selectedPath ?? [],
        },
      ],
      providerFallbackLabel,
      issues: [
        ...routing.issues,
        ...(routing.executionDecisionValidationIssues ?? []),
        ...(projection.plan.fallbackWarnings ?? []),
      ],
    },
  }
}

export function buildRuntimeInspectorSummaryCards(
  projection: RunRuntimeInspectorProjection | null,
  text: (ko: string, en: string) => string,
): RuntimeInspectorSummaryCard[] {
  if (!projection) {
    return [
      {
        id: "runtime",
        label: text("실행 상태", "Run state"),
        value: text("불러오는 중", "Loading"),
        tone: "stone",
      },
    ]
  }

  const pendingApprovals = projection.approvals.filter(
    (item) => item.status === "pending" || item.status === "required",
  ).length
  const failedSubSessions = projection.subSessions.filter(
    (item) => item.status === "failed" || item.status === "needs_revision",
  ).length
  const typedTrace = projection.typedTrace
  const typedStageBaseLabel = (() => {
    if (!typedTrace || typedTrace.status === "not_recorded") return text("기록 없음", "Not recorded")
    if (typedTrace.status === "unavailable") return text("확인 불가", "Unavailable")
    switch (typedTrace.currentStage) {
      case "request": return text("요청 접수", "Request received")
      case "analysis": return text("해결 방법 분석", "Solution analysis")
      case "execution": return text("실행", "Execution")
      case "evidence": return text("결과 근거 확인", "Evidence review")
      case "review": return text("결과 검증", "Result verification")
      case "recovery": return text("다른 방법 실행", "Recovery")
      case "finalization": return text("결과 전달", "Result delivery")
      case "not_started": return text("시작 전", "Not started")
      default: return text("확인 중", "Checking")
    }
  })()
  const typedStageLabel = typedTrace
    && typedTrace.status === "ready"
    && typedTrace.recoveryCount > 0
    && typedTrace.currentStage !== "recovery"
    ? `${typedStageBaseLabel} · ${text(`다른 방법 ${typedTrace.recoveryCount}회`, `${typedTrace.recoveryCount} alternative attempt${typedTrace.recoveryCount === 1 ? "" : "s"}`)}`
    : typedStageBaseLabel
  const typedVerificationLabel = (() => {
    if (!typedTrace || typedTrace.status === "not_recorded") return text("기록 없음", "Not recorded")
    if (typedTrace.status === "unavailable" || typedTrace.verification === "unknown") return text("확인 불가", "Unavailable")
    if (typedTrace.blocker === "policy") return text("권한 또는 정책 확인 필요", "Permission or policy review needed")
    if (typedTrace.blocker === "exhausted") return text("다른 해결 방법 없음", "No remaining solution path")
    if (typedTrace.blocker === "cancelled") return text("사용자 요청으로 중단", "Cancelled by user")
    if (typedTrace.terminal) return text("검증 및 전달 완료", "Verified and delivered")
    if (typedTrace.verification === "reviewed") return text("검증 완료", "Verified")
    if (typedTrace.verification === "evidence_recorded") return text("근거 확인 중", "Reviewing evidence")
    return text("검증 전", "Not reviewed")
  })()

  return [
    {
      id: "typed-stage",
      label: text("현재 처리 단계", "Current stage"),
      value: typedStageLabel,
      tone: typedTrace?.status === "unavailable" || (typedTrace?.issueCount ?? 0) > 0 ? "amber" : "blue",
    },
    {
      id: "typed-verification",
      label: text("결과 확인", "Result verification"),
      value: typedVerificationLabel,
      tone: typedTrace?.terminal
        ? "emerald"
        : typedTrace?.blocker !== undefined && typedTrace.blocker !== "none"
          ? "amber"
          : "stone",
    },
    {
      id: "mode",
      label: text("실행 모드", "Execution mode"),
      value: runtimeOrchestrationModeLabel(projection.orchestrationMode, text),
      tone: projection.orchestrationMode === "orchestration" ? "blue" : "stone",
    },
    {
      id: "subsessions",
      label: text("서브 에이전트 실행", "Sub-agent runs"),
      value: String(projection.subSessions.length),
      tone: failedSubSessions > 0 ? "amber" : "emerald",
    },
    {
      id: "data",
      label: text("데이터 교환", "Data exchange"),
      value: String(projection.dataExchanges.length),
      tone: projection.dataExchanges.some((item) => item.redactionState === "blocked")
        ? "rose"
        : "stone",
    },
    {
      id: "approvals",
      label: text("승인", "Approvals"),
      value: String(pendingApprovals),
      tone: pendingApprovals > 0 ? "amber" : "stone",
    },
    {
      id: "topology",
      label: text("위임 흐름", "Delegation flow"),
      value: projection.topologyRouting.mode === "route"
        ? projection.topologyRouting.entryNodeName ||
          runtimeExecutorDisplayName(projection.topologyRouting, projection.topologyRouting.entryNodeId) ||
          projection.topologyRouting.topologyName ||
          text("서브 에이전트 위임", "Sub-agent delegation")
        : runtimeTopologyReasonLabel(projection.topologyRouting.reasonCode, text),
      tone: projection.topologyRouting.mode === "route"
        ? "blue"
        : projection.topologyRouting.mode === "fallback"
          ? "amber"
          : "stone",
    },
    {
      id: "finalizer",
      label: text("최종 답변 정리", "Final response"),
      value: describeRuntimeFinalizerStatus(projection, text),
      tone: projection.finalizer.status === "delivered" ? "emerald" : "stone",
    },
  ]
}
