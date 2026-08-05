import { useEffect, useMemo, useState } from "react"
import { api, type AuditEvent, type ControlExportAudience, type ControlTimeline } from "../api/client"
import { ActiveInstructionsPanel } from "../components/ActiveInstructionsPanel"
import { EmptyState } from "../components/EmptyState"
import { ErrorState } from "../components/ErrorState"
import { FeatureGate } from "../components/FeatureGate"
import {
  buildApprovalParamSummary,
  buildToolResultSummary,
  describeApprovalToolName,
} from "../lib/approval-preview"
import { useUiI18n } from "../lib/ui-i18n"

type AuditStatusFilter = "" | "success" | "failed" | "denied" | "partial" | "info" | "blocked" | "pending"
type AuditKindFilter = "" | AuditEvent["kind"]
type AuditTimelineKindFilter = "" | AuditEvent["timelineKind"]
type TextFn = (ko: string, en: string) => string

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function statusClass(status: string): string {
  if (status === "success" || status === "info") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "failed" || status === "denied" || status === "blocked") return "border-red-200 bg-red-50 text-red-700"
  if (status === "pending" || status === "partial") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-stone-200 bg-stone-50 text-stone-600"
}

function auditStatusLabel(status: string, text: TextFn): string {
  switch (status) {
    case "success":
      return text("성공", "Success")
    case "failed":
      return text("실패", "Failed")
    case "denied":
      return text("거부됨", "Denied")
    case "partial":
      return text("일부 완료", "Partial")
    case "info":
      return text("정보", "Info")
    case "blocked":
      return text("차단됨", "Blocked")
    case "pending":
      return text("대기 중", "Pending")
    default:
      return text("상태 확인 필요", "State needs review")
  }
}

function auditKindLabel(kind: string, text: TextFn): string {
  switch (kind) {
    case "tool_call":
      return text("외부 도구 활동", "External tool activity")
    case "diagnostic":
      return text("진단", "Diagnostics")
    case "run_event":
      return text("실행 이벤트", "Run event")
    case "artifact":
      return text("결과물", "Artifact")
    case "delivery":
      return text("결과 전달", "Delivery")
    case "decision_trace":
      return text("결정 흐름", "Decision flow")
    default:
      return text("기록 유형 확인 필요", "Record kind needs review")
  }
}

function auditTimelineKindLabel(kind: string, text: TextFn): string {
  switch (kind) {
    case "ingress":
      return text("요청 접수", "Request intake")
    case "intake":
      return text("요청 분석", "Request analysis")
    case "contract":
      return text("처리 기준", "Processing contract")
    case "memory":
      return text("메모리", "Memory")
    case "tool":
      return text("외부 도구", "External tool")
    case "delivery":
      return text("결과 전달", "Delivery")
    case "recovery":
      return text("복구", "Recovery")
    case "completion":
      return text("완료", "Completion")
    default:
      return text("단계 확인 필요", "Timeline stage needs review")
  }
}

function auditReasonLabel(event: AuditEvent, text: TextFn): string {
  if (event.stopReason || event.errorCode) return text("이유 기록 있음", "Reason recorded")
  return "-"
}

function buildAuditDetailSummary(event: AuditEvent, text: TextFn): string[] {
  const lines: string[] = []
  if (event.params != null) {
    lines.push(text("입력 요약", "Input summary"))
    lines.push(...buildApprovalParamSummary(event.params, text))
  }
  if (event.detail != null) {
    lines.push(text("상세 기록", "Detail record"))
    lines.push(...buildToolResultSummary(event.detail, true, text))
  }
  if (event.output != null) {
    lines.push(text("출력 요약", "Output summary"))
    lines.push(...buildToolResultSummary(event.output, event.status !== "failed", text))
  }
  return lines.length > 0 ? lines : [text("추가 세부 정보 없음", "No extra detail")]
}

export function AuditPage() {
  const { text } = useUiI18n()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const [status, setStatus] = useState<AuditStatusFilter>("")
  const [kind, setKind] = useState<AuditKindFilter>("")
  const [timelineKind, setTimelineKind] = useState<AuditTimelineKindFilter>("")
  const [channel, setChannel] = useState("")
  const [toolName, setToolName] = useState("")
  const [runId, setRunId] = useState("")
  const [agentId, setAgentId] = useState("")
  const [teamId, setTeamId] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null)
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null)
  const [controlTimeline, setControlTimeline] = useState<ControlTimeline | null>(null)
  const [controlAudience, setControlAudience] = useState<ControlExportAudience>("user")
  const [controlLoading, setControlLoading] = useState(false)
  const [controlError, setControlError] = useState<string | null>(null)
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  const selectedDetailSummary = useMemo(
    () => selected ? buildAuditDetailSummary(selected, text) : [],
    [selected, text],
  )

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const scopedQuery = [
        query.trim(),
        agentId.trim(),
        teamId.trim(),
        sessionId.trim(),
      ].filter(Boolean).join(" ")
      const response = await api.audit({
        limit: 100,
        ...(status ? { status } : {}),
        ...(kind ? { kind } : {}),
        ...(timelineKind ? { timelineKind } : {}),
        ...(channel.trim() ? { channel: channel.trim() } : {}),
        ...(toolName.trim() ? { toolName: toolName.trim() } : {}),
        ...(runId.trim() ? { runId: runId.trim() } : {}),
        ...(scopedQuery ? { q: scopedQuery } : {}),
      })
      setEvents(response.items)
      setTotal(response.total)
      setSelected((current) => current && response.items.some((item) => item.id === current.id) ? current : response.items[0] ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function exportSelected(): Promise<void> {
    const targetRunId = selected?.runId ?? runId.trim()
    if (!targetRunId) return
    const response = await api.auditExport(targetRunId, "markdown")
    downloadText(`audit-${targetRunId}.md`, response.content)
  }

  async function loadControlTimeline(): Promise<void> {
    const targetRequestGroupId = selected?.requestGroupId ?? ""
    const targetRunId = selected?.runId ?? runId.trim()
    if (!targetRequestGroupId && !targetRunId) return
    setControlLoading(true)
    setControlError(null)
    try {
      const response = await api.controlTimeline({
        ...(targetRequestGroupId ? { requestGroupId: targetRequestGroupId } : { runId: targetRunId }),
        audience: controlAudience,
        limit: 500,
      })
      setControlTimeline(response.timeline)
    } catch (err) {
      setControlError(err instanceof Error ? err.message : String(err))
    } finally {
      setControlLoading(false)
    }
  }

  async function exportControl(): Promise<void> {
    const targetRequestGroupId = selected?.requestGroupId ?? ""
    const targetRunId = selected?.runId ?? runId.trim()
    if (!targetRequestGroupId && !targetRunId) return
    const response = await api.controlTimelineExport({
      ...(targetRequestGroupId ? { requestGroupId: targetRequestGroupId } : { runId: targetRunId }),
      audience: controlAudience,
      format: "markdown",
      limit: 1000,
    })
    downloadText(`control-timeline-${targetRequestGroupId || targetRunId}.md`, response.export.content)
  }

  async function cleanupOldAudit(): Promise<void> {
    const before = Date.now() - 30 * 24 * 60 * 60 * 1000
    const { preview } = await api.previewAuditCleanup({ before })
    const ok = window.confirm(text(
      `30일보다 오래된 기록 ${preview.deletableCount}건을 정리할까요? 참조 중인 ${preview.protectedCount}건은 유지됩니다.`,
      `Clean ${preview.deletableCount} records older than 30 days? ${preview.protectedCount} referenced records will be retained.`,
    ))
    if (!ok) return
    const response = await api.cleanupAudit({
      before: preview.before,
      confirm: preview.confirmationToken,
    })
    setCleanupMessage(text(
      `정리 완료: 감사 ${response.deleted.auditLogs}건, 진단 ${response.deleted.diagnosticEvents}건, 판단 ${response.deleted.decisionTraces ?? 0}건`,
      `Cleanup complete: ${response.deleted.auditLogs} audit logs, ${response.deleted.diagnosticEvents} diagnostic events, ${response.deleted.decisionTraces ?? 0} decision traces`,
    ))
    await load()
  }

  async function promoteSelected(): Promise<void> {
    if (!selected) return
    setPromotionMessage(null)
    try {
      const response = await api.promoteAuditEventToErrorCorpus(selected.id)
      setPromotionMessage(response.ok
        ? text("장애 샘플 후보로 저장했습니다.", "Saved as an error corpus candidate.")
        : response.message ?? text("장애 샘플 후보 저장에 실패했습니다.", "Failed to save error corpus candidate."))
      await load()
    } catch (err) {
      setPromotionMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-stone-100 p-6">
      <div className="rounded-[1.75rem] border border-stone-200 bg-white p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Audit</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">{text("감사 로그", "Audit logs")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-stone-600">
              {text(
                "도구 실행, 승인, 실행 이벤트, 진단, 아티팩트 전달 흐름을 하나의 타임라인으로 확인합니다.",
                "Inspect external tool activity, approvals, run events, diagnostics, and artifact delivery in one timeline.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50" onClick={() => void load()} disabled={loading}>
              {loading ? text("불러오는 중", "Loading") : text("새로고침", "Refresh")}
            </button>
            <button className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40" onClick={() => void exportSelected()} disabled={!selected?.runId && !runId.trim()}>
              {text("타임라인 내보내기", "Export timeline")}
            </button>
            <button className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40" onClick={() => void loadControlTimeline()} disabled={controlLoading || (!selected?.requestGroupId && !selected?.runId && !runId.trim())}>
              {controlLoading ? text("흐름 확인 중", "Loading flow") : text("실행 흐름 확인", "Inspect flow")}
            </button>
            <button className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => void cleanupOldAudit()}>
              {text("오래된 로그 정리", "Clean old logs")}
            </button>
          </div>
        </div>
        {cleanupMessage ? <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{cleanupMessage}</div> : null}
        {promotionMessage ? <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{promotionMessage}</div> : null}
      </div>

      <FeatureGate capabilityKey="audit.viewer" title={text("감사 로그", "Audit Logs")}>
        <section className="mt-6 rounded-[1.75rem] border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">{text("시스템 지침 검토", "System instruction review")}</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {text("관리 및 감사 작업에서만 지침 상태와 변경 검증 결과를 확인합니다.", "Review instruction status and change checks only for administration and audit work.")}
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              aria-expanded={instructionsOpen}
              onClick={() => setInstructionsOpen((open) => !open)}
            >
              {instructionsOpen ? text("검토 닫기", "Close review") : text("검토 열기", "Open review")}
            </button>
          </div>
        </section>
        {instructionsOpen ? (
          <div className="mt-4">
            <ActiveInstructionsPanel allowRawPromptEditing />
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 rounded-[1.75rem] border border-stone-200 bg-white p-4 lg:grid-cols-10">
          <input className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" placeholder={text("검색어", "Search")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <input className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" placeholder={text("실행 범위", "Run scope")} value={runId} onChange={(event) => setRunId(event.target.value)} />
          <input className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" placeholder={text("에이전트 범위", "Agent scope")} value={agentId} onChange={(event) => setAgentId(event.target.value)} />
          <input className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" placeholder={text("팀 범위", "Team scope")} value={teamId} onChange={(event) => setTeamId(event.target.value)} />
          <input className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" placeholder={text("대화 범위", "Conversation scope")} value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
          <input className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" placeholder={text("외부 도구 이름", "External tool name")} value={toolName} onChange={(event) => setToolName(event.target.value)} />
          <input className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" placeholder={text("채널", "Channel")} value={channel} onChange={(event) => setChannel(event.target.value)} />
          <select className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" value={kind} onChange={(event) => setKind(event.target.value as AuditKindFilter)}>
            <option value="">{text("모든 유형", "All kinds")}</option>
            <option value="tool_call">{text("외부 도구 활동", "External tool activity")}</option>
            <option value="diagnostic">{text("진단", "Diagnostics")}</option>
            <option value="run_event">{text("실행 이벤트", "Run events")}</option>
            <option value="artifact">{text("결과물", "Artifacts")}</option>
            <option value="delivery">{text("결과 전달", "Delivery")}</option>
            <option value="decision_trace">{text("결정 흐름", "Decision flow")}</option>
          </select>
          <select className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" value={timelineKind} onChange={(event) => setTimelineKind(event.target.value as AuditTimelineKindFilter)}>
            <option value="">{text("모든 단계", "All timeline stages")}</option>
            <option value="ingress">{text("요청 접수", "Request intake")}</option>
            <option value="intake">{text("요청 분석", "Request analysis")}</option>
            <option value="contract">{text("처리 기준", "Processing contract")}</option>
            <option value="memory">{text("메모리", "Memory")}</option>
            <option value="tool">{text("외부 도구", "External tools")}</option>
            <option value="delivery">{text("결과 전달", "Delivery")}</option>
            <option value="recovery">{text("복구", "Recovery")}</option>
            <option value="completion">{text("완료", "Completion")}</option>
          </select>
          <select className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-400" value={status} onChange={(event) => setStatus(event.target.value as AuditStatusFilter)}>
            <option value="">{text("모든 상태", "All statuses")}</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
            <option value="denied">denied</option>
            <option value="partial">partial</option>
            <option value="info">info</option>
            <option value="blocked">blocked</option>
            <option value="pending">pending</option>
          </select>
          <button className="rounded-2xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white lg:col-span-10" onClick={() => void load()}>
            {text("필터 적용", "Apply filters")}
          </button>
        </div>

        {error ? <div className="mt-6"><ErrorState title={text("감사 로그를 불러오지 못했습니다", "Failed to load audit logs")} description={error} /></div> : null}

        <div className="mt-6 rounded-[1.75rem] border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-stone-900">{text("실행 흐름 타임라인", "Control flow timeline")}</div>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {text("감사 로그와 분리된 실행 흐름입니다. 중복 도구 호출, 중복 답변, 전달 재시도, 복구 재진입을 확인합니다.", "Separate from audit logs. Inspect duplicate tools, duplicate answers, delivery retries, and recovery reentries.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="rounded-full border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700" value={controlAudience} onChange={(event) => setControlAudience(event.target.value as ControlExportAudience)}>
                <option value="user">{text("사용자 요약", "User summary")}</option>
                <option value="developer">{text("개발자 진단", "Developer diagnostics")}</option>
              </select>
              <button className="rounded-full border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40" onClick={() => void loadControlTimeline()} disabled={controlLoading || (!selected?.requestGroupId && !selected?.runId && !runId.trim())}>
                {text("조회", "Load")}
              </button>
              <button className="rounded-full border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40" onClick={() => void exportControl()} disabled={!controlTimeline || (!selected?.requestGroupId && !selected?.runId && !runId.trim())}>
                {text("내보내기", "Export")}
              </button>
            </div>
          </div>
          {controlError ? <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{controlError}</div> : null}
          {controlTimeline ? (
            <div className="mt-4">
              <div className="grid gap-2 text-xs sm:grid-cols-5">
                <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-stone-500">{text("전체", "Total")}</div><div className="text-sm font-semibold text-stone-900">{controlTimeline.summary.total}</div></div>
                <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-stone-500">{text("중복 외부 도구", "Duplicate external tools")}</div><div className="text-sm font-semibold text-stone-900">{controlTimeline.summary.duplicateToolCount}</div></div>
                <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-stone-500">{text("중복 답변", "Duplicate answers")}</div><div className="text-sm font-semibold text-stone-900">{controlTimeline.summary.duplicateAnswerCount}</div></div>
                <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-stone-500">{text("전달 재시도", "Delivery retries")}</div><div className="text-sm font-semibold text-stone-900">{controlTimeline.summary.deliveryRetryCount}</div></div>
                <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-stone-500">{text("복구 재진입", "Recovery reentries")}</div><div className="text-sm font-semibold text-stone-900">{controlTimeline.summary.recoveryReentryCount}</div></div>
              </div>
              <div className="mt-4 max-h-72 space-y-2 overflow-auto">
                {controlTimeline.events.length === 0 ? (
                  <div className="rounded-2xl border border-stone-200 px-4 py-3 text-sm text-stone-500">{text("표시할 실행 흐름이 없습니다.", "No control flow events to show.")}</div>
                ) : controlTimeline.events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-stone-200 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(event.severity === "error" ? "failed" : event.severity === "warning" ? "partial" : "info")}`}>{event.severity}</span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">{event.component}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{event.eventType}</span>
                      {event.duplicate ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">duplicate {event.duplicate.kind} #{event.duplicate.occurrence}</span> : null}
                      <span className="ml-auto text-xs text-stone-500">{formatTime(event.at)}</span>
                    </div>
                    <div className="mt-2 font-semibold text-stone-900">{event.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="rounded-[1.75rem] border border-stone-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between text-sm text-stone-500">
              <span>{text(`총 ${total}건`, `${total} events`)}</span>
              <span>{loading ? text("갱신 중", "Refreshing") : text("최근 100건", "Latest 100")}</span>
            </div>
            {events.length === 0 && !loading ? (
              <EmptyState title={text("표시할 감사 로그가 없습니다", "No audit logs to show")} description={text("필터를 줄이거나 실행 후 다시 확인하세요.", "Relax filters or try again after a run.")} />
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <button key={event.id} className={`w-full rounded-3xl border p-4 text-left transition ${selected?.id === event.id ? "border-stone-900 bg-stone-50" : "border-stone-200 bg-white hover:bg-stone-50"}`} onClick={() => setSelected(event)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(event.status)}`}>{auditStatusLabel(event.status, text)}</span>
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{auditKindLabel(event.kind, text)}</span>
                      <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">{auditTimelineKindLabel(event.timelineKind, text)}</span>
                      {event.channel ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{event.channel}</span> : null}
                      <span className="ml-auto text-xs text-stone-500">{formatTime(event.at)}</span>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-stone-900">{event.summary}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                      {event.toolName ? <span>{text("외부 도구", "External tool")}: {describeApprovalToolName(event.toolName, text)}</span> : null}
                      {event.runId ? <span>{text("실행 연결됨", "Run linked")}</span> : null}
                      {event.requestGroupId ? <span>{text("요청 흐름 연결됨", "Request flow linked")}</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[1.75rem] border border-stone-200 bg-white p-5">
            {selected ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Selected Event</div>
                <h2 className="mt-2 text-lg font-semibold text-stone-900">{selected.summary}</h2>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <dt className="text-stone-500">{text("시각", "Time")}</dt><dd className="text-right text-stone-800">{formatTime(selected.at)}</dd>
                  <dt className="text-stone-500">{text("상태", "Status")}</dt><dd className="text-right text-stone-800">{auditStatusLabel(selected.status, text)}</dd>
                  <dt className="text-stone-500">{text("유형", "Kind")}</dt><dd className="text-right text-stone-800">{auditKindLabel(selected.kind, text)}</dd>
                  <dt className="text-stone-500">{text("단계", "Timeline stage")}</dt><dd className="text-right text-stone-800">{auditTimelineKindLabel(selected.timelineKind, text)}</dd>
                  <dt className="text-stone-500">{text("채널", "Channel")}</dt><dd className="text-right text-stone-800">{selected.channel ?? "-"}</dd>
                  <dt className="text-stone-500">{text("외부 도구", "External tool")}</dt><dd className="text-right text-stone-800">{selected.toolName ? describeApprovalToolName(selected.toolName, text) : "-"}</dd>
                  <dt className="text-stone-500">{text("걸린 시간", "Duration")}</dt><dd className="text-right text-stone-800">{selected.durationMs != null ? `${selected.durationMs}ms` : "-"}</dd>
                  <dt className="text-stone-500">{text("승인", "Approval")}</dt><dd className="text-right text-stone-800">{selected.approvalRequired ? selected.approvedBy ? text("승인됨", "Approved") : text("필요", "Required") : "-"}</dd>
                  <dt className="text-stone-500">{text("이유", "Reason")}</dt><dd className="text-right text-stone-800">{auditReasonLabel(selected, text)}</dd>
                </dl>
                <button className="mt-5 w-full rounded-2xl border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={() => void promoteSelected()}>
                  {text("장애 샘플 후보로 저장", "Save as error corpus candidate")}
                </button>
                <div className="mt-5 rounded-3xl bg-stone-50 p-4 text-xs leading-6 text-stone-700">
                  <div className="font-semibold text-stone-900">{text("세부 요약", "Detail summary")}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {selectedDetailSummary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <EmptyState title={text("선택된 항목 없음", "No event selected")} description={text("왼쪽 목록에서 이벤트를 선택하세요.", "Select an event from the list.")} />
            )}
          </div>
        </div>
      </FeatureGate>
    </div>
  )
}
