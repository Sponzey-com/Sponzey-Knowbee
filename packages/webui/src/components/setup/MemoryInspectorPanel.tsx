import React from "react"
import type {
  UiMode,
  MemoryInspectorControlAction,
  MemoryInspectorControlResult,
  MemoryInspectorSnapshot,
} from "../../api/client"
import { useUiI18n } from "../../lib/ui-i18n"

function formatAgo(value: number | null): string {
  if (value == null) return "-"
  const seconds = Math.max(0, Math.floor(value / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatAt(value: number | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "-"
}

function displayControlLabel(text: (ko: string, en: string) => string, action: MemoryInspectorControlAction): string {
  switch (action) {
    case "dry_run_compaction":
      return text("압축 미리보기", "Dry-run compaction")
    case "latest_capsule_inspect":
      return text("최신 압축 메모리", "Latest compacted memory")
    case "rollup_inspect":
      return text("묶음 요약 보기", "Inspect rollup")
    case "safe_restore":
      return text("복원 미리보기", "Safe restore")
    case "force_compaction":
      return text("지금 압축", "Force compaction")
    case "capsule_invalidate":
      return text("압축 메모리 해제", "Invalidate compacted memory")
    default:
      return text("메모리 관리 작업", "Memory management action")
  }
}

function memoryOwnerAgentName(
  text: (ko: string, en: string) => string,
  card: MemoryInspectorSnapshot["ownerCards"][number],
): string {
  const agentName = card.agentNameSnapshot?.trim()
  if (agentName) return agentName
  if (card.ownerType === "main_agent") return text("메인 에이전트", "Main agent")
  if (card.ownerType === "sub_agent") return text("이름 없는 서브 에이전트", "Unnamed sub-agent")
  return text("이름 없는 메모리 대상", "Unnamed memory owner")
}

function ownerTypeLabel(text: (ko: string, en: string) => string, ownerType: string): string {
  if (ownerType === "main_agent") return text("메인", "Main")
  if (ownerType === "sub_agent") return text("서브 에이전트", "Sub-agent")
  return text("대상 확인 필요", "Owner needs review")
}

function memoryStateLabel(text: (ko: string, en: string) => string, state: string | null | undefined): string {
  switch (state) {
    case "ok":
    case "healthy":
    case "ready":
      return text("정상", "Ready")
    case "warning":
    case "degraded":
      return text("주의", "Warning")
    case "error":
    case "failed":
      return text("오류", "Error")
    default:
      return text("확인 필요", "Needs review")
  }
}

function hiddenRecordSummary(
  text: (ko: string, en: string) => string,
  value: string | null | undefined,
): string {
  if (!value?.trim()) return text("기록 없음", "No record")
  const lineCount = value.split(/\r?\n/).filter((line) => line.trim()).length
  return text(`기록 있음 · ${lineCount}줄 원문 숨김`, `Record exists · ${lineCount} raw lines hidden`)
}

function reasonRecordLabel(
  text: (ko: string, en: string) => string,
  value: string | null | undefined,
): string {
  return value?.trim() ? text("사유 기록 있음", "Reason recorded") : "-"
}

export function MemoryInspectorPanel({
  mode,
  snapshot,
  loading,
  error,
  actionLoading,
  actionError,
  actionResult,
  onRefresh,
  onControl,
}: {
  mode: UiMode
  snapshot: MemoryInspectorSnapshot | null
  loading: boolean
  error: string
  actionLoading: boolean
  actionError: string
  actionResult: MemoryInspectorControlResult | null
  onRefresh: () => void
  onControl: (action: MemoryInspectorControlAction) => void
}) {
  const { text, displayText } = useUiI18n()
  if (mode === "beginner") return null
  const isAdmin = mode === "admin"
  const ownerCards = snapshot?.ownerCards ?? []
  const selected = ownerCards[0]

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-stone-900">{text("메모리 점검", "Memory inspection")}</div>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            {text(
              "압축 상태, 압축 메모리 흐름, 불러온 기록, 압축 이력을 운영 화면에서 확인합니다. 원문 메모리와 내부 ID는 기본 화면에서 숨깁니다.",
              "Inspect compaction state, compacted memory flow, recall records, and compaction audit from the operations screen. Raw memory and internal IDs are hidden by default.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? text("불러오는 중", "Loading") : text("새로고침", "Refresh")}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          {displayText(error)}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{text("대상", "Owner")}</div>
          <div className="mt-2 text-sm font-semibold text-stone-900">{snapshot?.summary.owners ?? 0}</div>
          <div className="mt-1 text-xs text-stone-500">{text("주의 필요", "Warnings")} {snapshot?.summary.warningOwners ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{text("불러온 기록", "Recall")}</div>
          <div className="mt-2 text-sm font-semibold text-stone-900">{snapshot?.summary.recallEvents ?? 0}</div>
          <div className="mt-1 text-xs text-stone-500">{text("품질", "Quality")} {memoryStateLabel(text, snapshot?.summary.qualityStatus)}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{text("압축 실행", "Compaction runs")}</div>
          <div className="mt-2 text-sm font-semibold text-stone-900">{snapshot?.summary.compactionRuns ?? 0}</div>
          <div className="mt-1 text-xs text-stone-500">{text("정책 최소 토큰", "Min tokens")} {snapshot?.configuredPolicy.minContextTokens ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{text("최신 압축 메모리", "Latest compacted memory")}</div>
          <div className="mt-2 text-sm font-semibold text-stone-900">{selected ? formatAgo(selected.latestCapsuleAgeMs) : "-"}</div>
          <div className="mt-1 text-xs text-stone-500">{text("연결 깊이", "Chain depth")} {selected?.activeCapsuleChainDepth ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{text("최신 묶음 요약", "Latest rollup")}</div>
          <div className="mt-2 text-sm font-semibold text-stone-900">{selected ? formatAgo(selected.latestRollupAgeMs) : "-"}</div>
          <div className="mt-1 text-xs text-stone-500">{reasonRecordLabel(text, selected?.lastCompactionReason)}</div>
        </div>
      </div>

      {ownerCards.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="grid grid-cols-[1fr_0.9fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-2 border-b border-stone-200 bg-stone-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            <span>{text("에이전트", "Agent")}</span>
            <span>{text("최근 대화 크기", "Recent context size")}</span>
            <span>{text("보존 대기", "Pending")}</span>
            <span>{text("불러옴", "Recall")}</span>
            <span>{text("압축", "Compacted")}</span>
            <span>{text("변화", "Drift")}</span>
          </div>
          {ownerCards.map((card) => (
            <div key={card.ownerScopeKey} className="grid grid-cols-[1fr_0.9fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-2 border-b border-stone-100 px-4 py-2 text-xs text-stone-600 last:border-b-0">
              <span className="min-w-0">
                <span className="font-semibold text-stone-900">{displayText(memoryOwnerAgentName(text, card))}</span>
                <span className="ml-2 text-stone-400">{ownerTypeLabel(text, card.ownerType)}</span>
              </span>
              <span>{card.currentRawTokenEstimate}</span>
              <span>{card.pendingPreservationCount}</span>
              <span>{card.recallHitCount}</span>
              <span>{formatAgo(card.latestCapsuleAgeMs)}</span>
              <span className={card.driftWarningState === "warning" ? "font-semibold text-amber-700" : "text-emerald-700"}>
                {memoryStateLabel(text, card.driftWarningState)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {snapshot?.compactPreview ? (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold text-stone-500">{text("압축 미리보기", "Compaction preview")}</div>
            <div className="text-xs text-stone-500">
              {text("보존 범위와 고정 항목만 보여주고 실제 저장은 하지 않습니다.", "Shows the head range and preserved pinned items without writing state.")}
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">{text("전체", "Total")} {snapshot.compactPreview.sourceMessageCount}</div>
            <div className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">{text("유지", "Kept")} {snapshot.compactPreview.tailMessageCount}</div>
            <div className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">{text("제외", "Hidden")} {snapshot.compactPreview.droppedRawCount}</div>
            <div className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
              {snapshot.compactPreview.headRange
                ? text("앞부분 범위 기록 있음", "Head range recorded")
                : text("앞부분 범위 없음", "No head range")}
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
            {snapshot.compactPreview.capsuleSummary
              ? text("압축 요약 미리보기 기록 있음", "Compaction summary preview recorded")
              : text("압축 요약 미리보기 없음", "No compaction summary preview")}
          </div>
          <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
            {text("보존 고정 항목", "Preserved pinned items")} {snapshot.compactPreview.preservedPinnedItems.length}
          </div>
        </div>
      ) : null}

      {snapshot?.maintenanceRestorePromptBlock ? (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-semibold text-stone-500">{text("복원 기록", "Restore record")}</div>
          <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
            {hiddenRecordSummary(text, snapshot.maintenanceRestorePromptBlock)}
          </div>
        </div>
      ) : null}

      {snapshot?.recentCompactionRuns.length ? (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-semibold text-stone-500">{text("압축 이력", "Compaction audit")}</div>
          <div className="mt-3 space-y-2">
            {snapshot.recentCompactionRuns.slice(0, 6).map((run) => (
              <div key={run.id} className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
                <div className="font-semibold text-stone-900">
                  {run.modelId ? text("AI 기록 있음", "AI record exists") : text("AI 기록 없음", "No AI record")} · {memoryStateLabel(text, run.status)}
                </div>
                <div className="mt-1">{formatAt(run.createdAt)} · {text("사유", "Reasons")} {run.triggerReasonCodes.length}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-semibold text-stone-500">{text("관리자 조작", "Manual controls")}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(snapshot?.controls ?? []).map((control) => (
              <button
                key={control.action}
                type="button"
                onClick={() => onControl(control.action)}
                disabled={!control.enabled || actionLoading}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {displayControlLabel(text, control.action)}
              </button>
            ))}
          </div>
          {actionError ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {displayText(actionError)}
            </div>
          ) : null}
          {actionResult ? (
            <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
              <div className="font-semibold text-stone-900">{displayControlLabel(text, actionResult.action)}</div>
              <div className="mt-1 text-xs text-stone-500">{reasonRecordLabel(text, actionResult.reason)}</div>
              {actionResult.compactPreview ? (
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <div className="rounded-xl bg-white px-3 py-2 text-xs text-stone-600">
                    {text("전체", "Total")} {actionResult.compactPreview.sourceMessageCount}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2 text-xs text-stone-600">
                    {text("유지", "Kept")} {actionResult.compactPreview.tailMessageCount}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2 text-xs text-stone-600">
                    {text("제외", "Hidden")} {actionResult.compactPreview.droppedRawCount}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2 text-xs text-stone-600">
                    {actionResult.compactPreview.headRange
                      ? text("앞부분 범위 기록 있음", "Head range recorded")
                      : text("앞부분 범위 없음", "No head range")}
                  </div>
                  <div className="md:col-span-4 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-stone-600">
                    {actionResult.compactPreview.capsuleSummary
                      ? text("압축 요약 미리보기 기록 있음", "Compaction summary preview recorded")
                      : text("압축 요약 미리보기 없음", "No compaction summary preview")}
                  </div>
                </div>
              ) : null}
              {actionResult.latestCapsule ? (
                <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-stone-600">
                  <div className="font-semibold text-stone-900">{text("압축 메모리 기록 있음", "Compacted memory record exists")}</div>
                  <div className="mt-1 text-stone-500">
                    {text("보존 대기", "pending")} {actionResult.latestCapsule.pendingItems.length} ·
                    {" "}
                    {text("확인된 사실", "facts")} {actionResult.latestCapsule.confirmedFacts.length}
                  </div>
                </div>
              ) : null}
              {actionResult.latestRollup ? (
                <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-stone-600">
                  <div className="font-semibold text-stone-900">
                    {text("묶음 압축 메모리 기록 있음", "Rollup memory record exists")}
                  </div>
                  <div className="mt-1 text-stone-500">
                    {text("원본 묶음", "Source capsules")} {actionResult.latestRollup.sourceCapsuleCount} ·
                    {" "}
                    {reasonRecordLabel(text, actionResult.latestRollup.reasonCode)}
                  </div>
                </div>
              ) : null}
              {actionResult.maintenanceRestorePromptBlock ? (
                <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-stone-600">
                  {hiddenRecordSummary(text, actionResult.maintenanceRestorePromptBlock)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
