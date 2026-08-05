import * as React from "react"
import type {
  RunRuntimeInspectorModel,
  RunRuntimeInspectorPlanTask,
  RunRuntimeInspectorProjection,
  RunRuntimeInspectorTopologyRouting,
  RunRuntimeInspectorTopologyRun,
} from "../../contracts/runs"
import {
  buildRuntimeInspectorViewModels,
  buildRuntimeInspectorSummaryCards,
  describeRuntimeApprovalState,
  describeRuntimeFinalizerStatus,
  runtimeFinalizerSummary,
  runtimeControlActionLabels,
  runtimeSubSessionAgentName,
  selectRuntimeSubSession,
} from "../../lib/runtime-inspector"
import { useUiI18n } from "../../lib/ui-i18n"
import { CollapsibleText } from "./CollapsibleText"

function summaryToneClassName(tone: "stone" | "blue" | "emerald" | "amber" | "rose"): string {
  switch (tone) {
    case "blue":
      return "border-sky-100 bg-sky-50 text-sky-800"
    case "emerald":
      return "border-emerald-100 bg-emerald-50 text-emerald-800"
    case "amber":
      return "border-amber-100 bg-amber-50 text-amber-800"
    case "rose":
      return "border-rose-100 bg-rose-50 text-rose-800"
    case "stone":
      return "border-stone-200 bg-stone-50 text-stone-700"
  }
}

function statusToneClassName(status: string): string {
  if (status === "completed" || status === "approved" || status === "delivered") {
    return "border-emerald-100 bg-emerald-50 text-emerald-800"
  }
  if (status === "failed" || status === "denied") {
    return "border-rose-100 bg-rose-50 text-rose-800"
  }
  if (status === "needs_revision" || status === "awaiting_approval" || status === "pending") {
    return "border-amber-100 bg-amber-50 text-amber-800"
  }
  return "border-stone-200 bg-stone-50 text-stone-700"
}

function runtimeStatusLabel(status: string, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (status === "running" || status === "pending") return text("진행 중", "Running")
  if (status === "completed" || status === "approved" || status === "delivered") return text("완료", "Done")
  if (status === "failed") return text("실패", "Failed")
  if (status === "denied") return text("거부됨", "Denied")
  if (status === "needs_revision") return text("수정 필요", "Needs revision")
  if (status === "awaiting_approval") return text("승인 대기", "Awaiting approval")
  if (status === "cancelled") return text("취소됨", "Cancelled")
  return text("상태 확인 필요", "Review state")
}

function expectedOutputKindLabel(kind: string, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (kind === "text") return text("텍스트", "Text")
  if (kind === "artifact") return text("파일 또는 산출물", "Artifact")
  if (kind === "tool_result") return text("외부 도구 결과", "External tool result")
  if (kind === "data_package") return text("전달 데이터", "Data package")
  if (kind === "state_change") return text("상태 변경", "State change")
  return text("산출물", "Output")
}

function runtimeModelIdentitySummary(model: RunRuntimeInspectorModel, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (model.fallbackApplied) return text("AI 실행 기록 있음 · 대안 모델 사용", "AI execution recorded · fallback model used")
  return text("AI 실행 기록 있음", "AI execution recorded")
}

function runtimeResultStatusLabel(status: string | undefined, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (!status) return text("없음", "None")
  if (status === "completed" || status === "success" || status === "delivered") return text("완료", "Done")
  if (status === "partial" || status === "partial_success") return text("부분 완료", "Partial")
  if (status === "failed") return text("실패", "Failed")
  if (status === "impossible") return text("처리 불가", "Impossible")
  if (status === "needs_revision") return text("수정 필요", "Needs revision")
  return text("결과 기록 있음", "Result recorded")
}

function runtimeReviewVerdictLabel(verdict: string | undefined, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (!verdict) return text("없음", "None")
  if (verdict === "accepted" || verdict === "approved" || verdict === "pass") return text("검토 통과", "Review passed")
  if (verdict === "needs_revision") return text("수정 필요", "Needs revision")
  if (verdict === "rejected" || verdict === "failed") return text("검토 실패", "Review failed")
  if (verdict === "insufficient_evidence") return text("근거 부족", "Insufficient evidence")
  return text("검토 기록 있음", "Review recorded")
}

function runtimeParentIntegrationStatusLabel(status: string | undefined, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (!status) return text("없음", "None")
  if (status === "integrated" || status === "completed" || status === "accepted") return text("취합 완료", "Integrated")
  if (status === "pending") return text("취합 대기", "Integration pending")
  if (status === "needs_revision" || status === "redelegated") return text("재위임 필요", "Redelegation needed")
  if (status === "blocked_insufficient_evidence" || status === "blocked") return text("취합 보류", "Integration blocked")
  return text("취합 기록 있음", "Integration recorded")
}

function dataExchangeAllowedUseLabel(allowedUse: string, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (allowedUse === "temporary_context") return text("이번 실행에서만 사용", "Used only for this run")
  if (allowedUse === "memory_candidate") return text("메모리 후보", "Memory candidate")
  if (allowedUse === "verification_only") return text("검증 전용", "Verification only")
  return text("사용 범위 확인 필요", "Review allowed use")
}

function dataExchangeRedactionStateLabel(redactionState: string, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (redactionState === "redacted") return text("민감 내용 숨김", "Sensitive content hidden")
  if (redactionState === "not_sensitive") return text("민감 내용 없음", "No sensitive content")
  if (redactionState === "blocked") return text("전달 차단", "Exchange blocked")
  return text("보호 상태 확인 필요", "Review protection state")
}

function taskExecutionKindLabel(kind: string, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (kind === "delegated_sub_agent" || kind === "sub_agent") return text("서브 에이전트 위임", "Sub-agent delegation")
  if (kind === "direct" || kind === "direct_current_agent") return text("직접 처리", "Direct handling")
  if (kind === "root_knowbee_direct" || kind === "knowbee_direct") return text("메인 에이전트 직접 처리", "Main-agent direct handling")
  if (kind === "tool" || kind === "tool_execution") return text("외부 도구 실행", "External tool execution")
  if (kind === "approval" || kind === "human_check") return text("사람 검토", "Human review")
  return text("작업", "Task")
}

function assignmentSourceLabel(
  source: string | undefined,
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  if (source === "topology") return text("저장된 구성", "Saved setup")
  if (source === "agent") return text("에이전트 판단", "Agent decision")
  if (source === "team") return text("팀 구성", "Team setup")
  if (source === "direct") return text("직접 처리", "Direct")
  return ""
}

function runtimeExecutorUserLabel(
  routing: RunRuntimeInspectorTopologyRouting,
  executorId: string | undefined,
): string | undefined {
  if (!executorId) return undefined
  const name = routing.executionDecisionExecutorNameById?.[executorId]?.trim()
  return name || undefined
}

function runtimeAssignedTaskAgentLabel(
  task: RunRuntimeInspectorPlanTask,
  routing: RunRuntimeInspectorTopologyRouting,
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  return (
    task.assignedExecutorName?.trim() ||
    runtimeExecutorUserLabel(routing, task.assignedExecutorId) ||
    runtimeExecutorUserLabel(routing, task.assignedAgentId) ||
    text("서브 에이전트", "Sub-agent")
  )
}

function runtimeTopologyEntryLabel(
  topologyRun: RunRuntimeInspectorTopologyRun,
  routing: RunRuntimeInspectorTopologyRouting,
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  return (
    routing.entryNodeName?.trim() ||
    runtimeExecutorUserLabel(routing, topologyRun.entryNodeId) ||
    text("시작 서브 에이전트", "Entry sub-agent")
  )
}

function shortenRuntimeIdentifier(value: string): string {
  const normalized = value.trim()
  if (normalized.length <= 24) return normalized
  return `${normalized.slice(0, 10)}...${normalized.slice(-8)}`
}

function RuntimeInspectorIdentityValue({
  label,
  value,
  emptyLabel,
  displayText,
}: {
  label: string
  value: string | undefined
  emptyLabel: string
  displayText: (value: string) => string
}) {
  const normalized = value?.trim()
  const visible = normalized ? shortenRuntimeIdentifier(displayText(normalized)) : emptyLabel
  return (
    <div className="min-w-0 rounded-lg border border-stone-100 bg-white/70 px-2.5 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-stone-400">
        {label}
      </div>
      <div
        className="mt-0.5 truncate font-mono text-[11px] font-medium text-stone-500"
        title={normalized ? displayText(normalized) : emptyLabel}
      >
        {visible}
      </div>
    </div>
  )
}

function RuntimeInspectorIdList({
  label,
  values,
  emptyLabel,
  displayText,
  displayValue,
}: {
  label: string
  values: string[]
  emptyLabel: string
  displayText: (value: string) => string
  displayValue?: (value: string) => string
}) {
  return (
    <div className="rounded-md bg-white px-2.5 py-2">
      <div className="font-semibold text-stone-600">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.length > 0 ? values.map((value) => {
          const visibleValue = displayValue ? displayValue(value) : displayText(value)
          return (
          <span
            key={value}
            className="rounded-full bg-stone-50 px-2 py-0.5 font-semibold text-stone-800"
            title={displayText(value)}
          >
            {visibleValue}
          </span>
          )
        }) : (
          <span className="rounded-full bg-stone-50 px-2 py-0.5 font-semibold text-stone-500">
            {emptyLabel}
          </span>
        )}
      </div>
    </div>
  )
}

export function RunRuntimeInspectorPanel({
  projection,
  selectedSubSessionId,
  onSelectSubSession,
  loading,
  error,
}: {
  projection: RunRuntimeInspectorProjection | null
  selectedSubSessionId: string | null
  onSelectSubSession: (subSessionId: string) => void
  loading: boolean
  error: string
}) {
  const { text, displayText, formatTime } = useUiI18n()
  const selectedSubSession = selectRuntimeSubSession(projection, selectedSubSessionId)
  const summaryCards = buildRuntimeInspectorSummaryCards(projection, text)
  const viewModels = buildRuntimeInspectorViewModels(projection, text)
  const actionLabels = runtimeControlActionLabels(selectedSubSession, text)
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">
            {text("실행 현황 상세", "Run details")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              "상위 실행, 서브 에이전트 실행, 검토, 승인, 데이터 교환 상태를 한곳에서 확인합니다.",
              "Review parent run, sub-agent run, review, approval, and data exchange state in one place.",
            )}
          </div>
        </div>
        {loading ? (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-600">
            {text("갱신 중", "Refreshing")}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {displayText(error)}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <div
            key={card.id}
            className={`rounded-xl border px-3 py-2 ${summaryToneClassName(card.tone)}`}
          >
            <div className="text-[11px] font-semibold opacity-80">{card.label}</div>
            <div className="mt-1 text-sm font-semibold break-words [overflow-wrap:anywhere]">
              {displayText(card.value)}
            </div>
          </div>
        ))}
      </div>

      {!projection ? (
        <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-500">
          {loading
            ? text("실행 상태 정보를 불러오는 중입니다.", "Loading run state.")
            : text("실행 상태 정보가 없습니다.", "No run state.")}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div
            className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-900"
            data-testid="runtime-inspector-basic-view"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-stone-950">
                {text("실행 흐름", "Execution flow")}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-emerald-800">
                <span className="rounded-full bg-white px-2 py-0.5 font-semibold">
                  {displayText(viewModels.basic.topologyLabel)}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 font-semibold">
                  {displayText(viewModels.basic.validationStatus)}
                </span>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-stone-400">
                  {text("현재 서브 에이전트", "Current sub-agent")}
                </div>
                <div className="mt-1 text-sm font-semibold text-stone-950">
                  {displayText(viewModels.basic.currentExecutorName)}
                </div>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-stone-400">
                  {text("선택된 서브 에이전트", "Selected sub-agent")}
                </div>
                <div className="mt-1 text-sm font-semibold text-stone-950">
                  {displayText(viewModels.basic.selectedExecutorName)}
                </div>
                {viewModels.basic.selectedExecutorRoleName ? (
                  <div className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    {displayText(viewModels.basic.selectedExecutorRoleName)}
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-stone-400">
                  {text("위임 경로", "Delegation path")}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-stone-950">
                  {viewModels.basic.selectedPathNames.length > 0 ? (
                    viewModels.basic.selectedPathNames.map((name, index) => (
                      <React.Fragment key={`${name}:${index}`}>
                        {index > 0 ? <span className="text-stone-300">→</span> : null}
                        <span className="rounded-full bg-stone-50 px-2 py-0.5">
                          {displayText(name)}
                        </span>
                      </React.Fragment>
                    ))
                  ) : (
                    <span className="text-stone-500">{text("경로 없음", "No path")}</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-stone-400">
                  {text("결과 취합", "Aggregation")}
                </div>
                <div className="mt-1 text-sm font-semibold text-stone-950">
                  {displayText(viewModels.basic.aggregationStatus)}
                </div>
              </div>
            </div>
            {viewModels.basic.warningLabels.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {viewModels.basic.warningLabels.map((warning) => (
                  <span key={warning} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    {displayText(warning)}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-emerald-900">
              {displayText(viewModels.basic.delegationStatus)}
            </div>
          </div>

          <div
            className={`rounded-xl border px-3 py-3 text-xs leading-5 ${
              viewModels.basic.routingTone === "route"
                ? "border-sky-100 bg-sky-50 text-sky-800"
                : viewModels.basic.routingTone === "fallback"
                  ? "border-amber-100 bg-amber-50 text-amber-800"
                  : "border-stone-200 bg-stone-50 text-stone-600"
            }`}
            data-testid="runtime-inspector-topology-routing"
            data-routing-mode={viewModels.basic.routingMode}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-stone-900">
                {text("실행 판단", "Execution decision")}
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold">
                {viewModels.basic.routingMode}
              </span>
            </div>
            <div className="mt-2">
              {viewModels.basic.routingSummary}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {viewModels.basic.routingPills.map((pill) => (
                <span key={pill} className="rounded-full bg-white px-2 py-0.5 font-semibold">
                  {displayText(pill)}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
            <div className="font-semibold text-stone-900">
              {text("실행 계획", "Execution plan")}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                {text("직접", "Direct")}: {projection.plan.directTaskCount}
              </div>
              <div>
                {text("자동 배정 작업", "Auto-assigned tasks")}: {projection.plan.delegatedTaskCount}
              </div>
              <div>
                {text("승인 요구", "Approval requirements")}:{" "}
                {projection.plan.approvalRequirementCount}
              </div>
              <div>
                {text("병렬 그룹", "Parallel groups")}: {projection.plan.parallelGroupCount}
              </div>
            </div>
            {projection.plan.taskSummaries.length > 0 ? (
              <div className="mt-3 space-y-2">
                {projection.plan.taskSummaries.map((task) => (
                  <div key={task.taskId} className="rounded-lg bg-white px-3 py-2">
                    <CollapsibleText
                      value={displayText(task.goal)}
                      threshold={140}
                      clampLines={2}
                      showMoreLabel={text("전체 보기", "Show more")}
                      showLessLabel={text("접기", "Show less")}
                      className="font-medium text-stone-900"
                      buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                    />
                    <div className="mt-1 break-words text-[11px] text-stone-500 [overflow-wrap:anywhere]">
                      {taskExecutionKindLabel(task.executionKind, text)}
                      {task.assignedExecutorName || task.assignedExecutorId || task.assignedAgentId
                        ? ` · ${displayText(
                          runtimeAssignedTaskAgentLabel(task, projection.topologyRouting, text),
                        )}`
                        : ""}
                      {task.assignmentSource ? ` · ${assignmentSourceLabel(task.assignmentSource, text)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-stone-700">
              {text("서브 에이전트 실행 목록", "Sub-agent runs")}
            </div>
            {projection.subSessions.length > 0 ? (
              <div className="grid gap-2">
                {projection.subSessions.map((subSession) => (
                  <button
                    key={subSession.subSessionId}
                    type="button"
                    onClick={() => onSelectSubSession(subSession.subSessionId)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      selectedSubSession?.subSessionId === subSession.subSessionId
                        ? "border-sky-200 bg-sky-50"
                        : "border-stone-200 bg-stone-50 hover:bg-stone-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-semibold text-stone-900 [overflow-wrap:anywhere]">
                          {displayText(runtimeSubSessionAgentName(subSession))}
                        </div>
                        <div className="mt-1 break-words text-xs text-stone-500 [overflow-wrap:anywhere]">
                          {displayText(subSession.commandSummary)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusToneClassName(subSession.status)}`}
                      >
                        {runtimeStatusLabel(subSession.status, text)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-500">
                      <span className="rounded-full bg-white px-2 py-1">
                        {describeRuntimeApprovalState(subSession.approvalState, text)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-500">
                {text("이 실행에는 하위 서브 에이전트 실행이 없습니다.", "This run has no child sub-agent runs.")}
              </div>
            )}
          </div>

          {selectedSubSession ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-stone-900">
                    {displayText(runtimeSubSessionAgentName(selectedSubSession))}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-[11px] ${statusToneClassName(selectedSubSession.status)}`}
                >
                  {runtimeStatusLabel(selectedSubSession.status, text)}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-white px-3 py-2">
                  <div className="font-semibold text-stone-900">
                    {text("예상 결과", "Expected output")}
                  </div>
                  <div className="mt-2 space-y-2">
                    {selectedSubSession.expectedOutputs.length > 0 ? (
                      selectedSubSession.expectedOutputs.map((output) => (
                        <div key={output.outputId}>
                          <CollapsibleText
                            value={displayText(output.description)}
                            threshold={140}
                            clampLines={2}
                            showMoreLabel={text("전체 보기", "Show more")}
                            showLessLabel={text("접기", "Show less")}
                            className="font-medium text-stone-800"
                            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                          />
                          <div className="text-[11px] text-stone-500">
                            {expectedOutputKindLabel(output.kind, text)} ·{" "}
                            {output.required ? text("필수", "required") : text("선택", "optional")}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-stone-500">
                        {text("기대 산출물 없음", "No expected outputs")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-white px-3 py-2">
                  <div className="font-semibold text-stone-900">{text("AI 모델", "AI model")}</div>
                  {selectedSubSession.model ? (
                    <div className="mt-2 space-y-1">
                      <div>
                        {runtimeModelIdentitySummary(selectedSubSession.model, text)}
                      </div>
                      <div>
                        {text("토큰", "tokens")}:{" "}
                        {selectedSubSession.model.estimatedInputTokens +
                          selectedSubSession.model.estimatedOutputTokens}
                      </div>
                      <div>
                        {text("예상 비용", "cost")}: {selectedSubSession.model.estimatedCost.toFixed(6)}
                      </div>
                      <div>
                        {text("지연 시간", "latency")}: {selectedSubSession.model.latencyMs ?? 0}ms
                      </div>
                      <div>
                        {text("대안 모델", "fallback")}:{" "}
                        {selectedSubSession.model.fallbackApplied
                          ? text("사용", "used")
                          : text("없음", "none")}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-stone-500">
                      {text("모델 스냅샷 없음", "No model snapshot")}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-white px-3 py-2">
                <div className="font-semibold text-stone-900">
                  {text("결과 검토", "Result review")}
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    {text("결과", "result")}:{" "}
                    {runtimeResultStatusLabel(selectedSubSession.result?.status, text)}
                  </div>
                  <div>
                    {text("판정", "verdict")}:{" "}
                    {runtimeReviewVerdictLabel(selectedSubSession.review?.verdict, text)}
                  </div>
                  <div>
                    {text("취합", "integration")}:{" "}
                    {runtimeParentIntegrationStatusLabel(selectedSubSession.review?.parentIntegrationStatus, text)}
                  </div>
                  <div>
                    {text("피드백", "feedback")}: {runtimeStatusLabel(selectedSubSession.feedback.status, text)}
                  </div>
                </div>
                {selectedSubSession.review?.issueCodes.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedSubSession.review.issueCodes.map((code) => (
                      <span
                        key={code}
                        className="rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
                      >
                        {displayText(code)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {selectedSubSession.result?.risksOrGaps.length ? (
                  <div className="mt-2 space-y-1">
                    {selectedSubSession.result.risksOrGaps.map((item) => (
                      <CollapsibleText
                        key={item}
                        value={displayText(item)}
                        threshold={140}
                        clampLines={2}
                        showMoreLabel={text("전체 보기", "Show more")}
                        showLessLabel={text("접기", "Show less")}
                        className="break-words text-[11px] text-stone-500 [overflow-wrap:anywhere]"
                        buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 rounded-lg bg-white px-3 py-2">
                <div className="font-semibold text-stone-900">
                  {text("허용된 제어", "Allowed controls")}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {actionLabels.length > 0 ? (
                    actionLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700"
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="text-stone-500">
                      {text("허용된 제어 없음", "No controls allowed")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
              <div className="font-semibold text-stone-900">
                {text("데이터 교환", "Data exchange")}
              </div>
              <div className="mt-2 space-y-2">
                {projection.dataExchanges.length > 0 ? (
                  projection.dataExchanges.map((exchange) => (
                    <div key={exchange.exchangeId} className="rounded-lg bg-white px-3 py-2">
                      <CollapsibleText
                        value={displayText(exchange.purpose)}
                        threshold={140}
                        clampLines={2}
                        showMoreLabel={text("전체 보기", "Show more")}
                        showLessLabel={text("접기", "Show less")}
                        className="font-medium text-stone-900"
                        buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                      />
                      <div className="mt-1 text-[11px] text-stone-500">
                        {dataExchangeAllowedUseLabel(exchange.allowedUse, text)} · {dataExchangeRedactionStateLabel(exchange.redactionState, text)} ·{" "}
                        {text("출처 기록", "provenance")} {exchange.provenanceCount}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-stone-500">
                    {text("데이터 교환 없음", "No data exchange")}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
              <div className="font-semibold text-stone-900">{text("승인", "Approvals")}</div>
              <div className="mt-2 space-y-2">
                {projection.approvals.length > 0 ? (
                  projection.approvals.map((approval) => (
                    <div key={approval.approvalId} className="rounded-lg bg-white px-3 py-2">
                      <div className="font-medium text-stone-900">
                        {describeRuntimeApprovalState(approval.status, text)}
                      </div>
                      <CollapsibleText
                        value={displayText(approval.summary)}
                        threshold={140}
                        clampLines={2}
                        showMoreLabel={text("전체 보기", "Show more")}
                        showLessLabel={text("접기", "Show less")}
                        className="mt-1 break-words text-[11px] text-stone-500 [overflow-wrap:anywhere]"
                        buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-stone-500">
                    {text("승인 이벤트 없음", "No approval events")}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
            <div className="font-semibold text-stone-900">
              {describeRuntimeFinalizerStatus(projection, text)}
            </div>
            <CollapsibleText
              value={displayText(runtimeFinalizerSummary(projection, text))}
              threshold={180}
              clampLines={3}
              showMoreLabel={text("전체 보기", "Show more")}
              showLessLabel={text("접기", "Show less")}
              className="mt-1 break-words text-stone-500 [overflow-wrap:anywhere]"
              buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
            />
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
            <div className="font-semibold text-stone-900">
              {text("실행 시간순 기록", "Runtime timeline")}
            </div>
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
              {projection.timeline.length > 0 ? (
                projection.timeline.map((event) => (
                  <div key={event.id} className="rounded-lg bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">{displayText(event.kind)}</span>
                      {event.status ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${statusToneClassName(event.status)}`}
                        >
                          {runtimeStatusLabel(event.status, text)}
                        </span>
                      ) : null}
                      <span className="text-[11px] text-stone-400">{formatTime(event.at)}</span>
                    </div>
                    <CollapsibleText
                      value={displayText(event.summary)}
                      threshold={160}
                      clampLines={2}
                      showMoreLabel={text("전체 보기", "Show more")}
                      showLessLabel={text("접기", "Show less")}
                      className="mt-1 break-words text-stone-500 [overflow-wrap:anywhere]"
                      buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                    />
                  </div>
                ))
              ) : (
                <div className="text-stone-500">
                  {text("표시할 이벤트가 없습니다.", "No events to display.")}
                </div>
              )}
            </div>
          </div>

          {projection.topologyRuns.length > 0 ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
              <div className="font-semibold text-stone-900">
                {text("서브 에이전트 실행 기록", "Sub-agent run history")}
              </div>
              <div className="mt-2 space-y-2">
                {projection.topologyRuns.map((topologyRun) => (
                  <div key={topologyRun.topologyRunId} className="rounded-lg bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">
                        {displayText(projection.topologyRouting.topologyName ?? text("업무 흐름 실행", "Workflow run"))}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${statusToneClassName(topologyRun.status)}`}
                      >
                        {runtimeStatusLabel(topologyRun.status, text)}
                      </span>
                      {topologyRun.entryNodeId ? (
                        <span className="rounded-full bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                          {displayText(
                            runtimeTopologyEntryLabel(topologyRun, projection.topologyRouting, text),
                          )}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      {text("서브 에이전트 실행", "sub-agent runs")} {topologyRun.nodeRunCount} ·{" "}
                      {text("연결", "connections")} {topologyRun.observedEdgeCount} ·{" "}
                      {text("실패 항목", "failures")} {topologyRun.failureCount}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <details
            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600"
            data-testid="runtime-inspector-diagnostic-view"
          >
            <summary className="cursor-pointer font-semibold text-stone-900">
              {text("진단 정보", "Diagnostics")}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                {viewModels.diagnostic.identity.map((item) => (
                  <RuntimeInspectorIdentityValue
                    key={item.id}
                    label={item.label}
                    value={item.value}
                    emptyLabel={text("정보 없음", "Unknown")}
                    displayText={displayText}
                  />
                ))}
              </div>
              {viewModels.diagnostic.routing.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {viewModels.diagnostic.routing.map((item) => (
                    <div key={item.id} className="rounded-lg bg-white px-3 py-2">
                      <div className="font-semibold text-stone-600">{item.label}</div>
                      <div className="mt-1 break-words font-mono text-[11px] text-stone-500 [overflow-wrap:anywhere]">
                        {displayText(item.value)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div
                className="rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-[11px] leading-5 text-stone-700"
                data-testid="runtime-inspector-executor-scope"
              >
                <div className="font-semibold text-stone-900">
                  {text("진단용 내부 식별자", "Diagnostic internal identifiers")}
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {viewModels.diagnostic.executorIds.map((item) => (
                    <RuntimeInspectorIdList
                      key={item.id}
                      label={item.label}
                      values={item.values}
                      emptyLabel={text("없음", "None")}
                      displayText={displayText}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 font-semibold">
                    {viewModels.diagnostic.providerFallbackLabel}
                  </span>
                  {viewModels.diagnostic.issues.map((issue) => (
                    <span key={issue} className="rounded-full bg-white px-2 py-0.5 font-semibold">
                      {displayText(issue)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
