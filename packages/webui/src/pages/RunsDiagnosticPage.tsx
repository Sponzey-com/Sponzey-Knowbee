import { Suspense, lazy, useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  type AdminArtifactCleanupDisplay,
  type ChannelSmokeChannel,
  type ChannelSmokeRunSummary,
  type MemoryAccessTraceItem,
  type RetrievalTimeline,
  api,
} from "../api/client"
import { EmptyState } from "../components/EmptyState"
import { ArtifactCleanupPanel } from "../components/runs/ArtifactCleanupPanel"
import { CollapsibleText } from "../components/runs/CollapsibleText"
import { RunEventFeed } from "../components/runs/RunEventFeed"
import { RunStatusCard } from "../components/runs/RunStatusCard"
import { RunStepTimeline } from "../components/runs/RunStepTimeline"
import { RunSummaryPanel } from "../components/runs/RunSummaryPanel"
import { TaskArtifactPanel } from "../components/runs/TaskArtifactPanel"
import { TaskChecklistPanel } from "../components/runs/TaskChecklistPanel"
import { TaskFailurePanel } from "../components/runs/TaskFailurePanel"
import type { DoctorReport, DoctorStatus } from "../contracts/doctor"
import type { OperationsHealthItem, OperationsSummary } from "../contracts/operations"
import type { RootRun, RunRuntimeInspectorProjection } from "../contracts/runs"
import {
  type AdvancedCleanupNotice,
  type AdvancedDiagnosticStatusKind,
  type AdvancedDiagnosticStatusView,
  type AdvancedDoctorGuideView,
  type AdvancedRunListItemView,
  type AdvancedRunStatusView,
  type AdvancedRunSummaryCard,
  type AdvancedStatusTone,
  buildAdvancedDiagnosticStatuses,
  buildAdvancedRunListItems,
  buildAdvancedRunSummaryCards,
  buildCleanupNoticeFromDeleteResult,
  buildCleanupNoticeFromStaleResult,
  buildDoctorActionGuides,
} from "../lib/advanced-runs"
import {
  buildTaskMonitorCards,
  describeTaskChecklistProgress,
  describeTaskDeliveryStatus,
  filterTaskTimelineForMode,
} from "../lib/task-monitor"
import type { TaskMonitorCard, TaskMonitorViewMode } from "../lib/task-monitor"
import { useUiI18n } from "../lib/ui-i18n"
import { useRunsStore } from "../stores/runs"

const RunRuntimeInspectorPanel = lazy(() =>
  import("../components/runs/RunRuntimeInspectorPanel").then((module) => ({
    default: module.RunRuntimeInspectorPanel,
  })),
)

function TaskMonitorBadges({
  executionRecordCount,
  checklistLabel,
  deliveryLabel,
  text,
}: {
  executionRecordCount: number
  checklistLabel: string
  deliveryLabel: string
  text: (ko: string, en: string) => string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-700">
        {text("실행 기록", "Run records")} {executionRecordCount}
      </span>
      <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-700">
        {text("진행 단계", "Progress")} {checklistLabel}
      </span>
      <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-700">
        {text("결과 전달", "Result delivery")} {deliveryLabel}
      </span>
    </div>
  )
}

function advancedToneClassName(tone: AdvancedStatusTone): string {
  switch (tone) {
    case "blue":
      return "border-sky-100 bg-sky-50 text-sky-800"
    case "amber":
      return "border-amber-100 bg-amber-50 text-amber-800"
    case "emerald":
      return "border-emerald-100 bg-emerald-50 text-emerald-800"
    case "rose":
      return "border-rose-100 bg-rose-50 text-rose-800"
    case "red":
      return "border-red-100 bg-red-50 text-red-800"
    case "stone":
      return "border-stone-200 bg-stone-50 text-stone-700"
  }
}

function diagnosticToneClassName(status: AdvancedDiagnosticStatusKind): string {
  switch (status) {
    case "ok":
      return "border-emerald-100 bg-emerald-50 text-emerald-800"
    case "degraded":
      return "border-amber-100 bg-amber-50 text-amber-800"
    case "down":
      return "border-rose-100 bg-rose-50 text-rose-800"
    case "idle":
      return "border-stone-200 bg-stone-50 text-stone-700"
  }
}

function doctorToneClassName(status: DoctorStatus): string {
  switch (status) {
    case "ok":
      return "border-emerald-100 bg-emerald-50 text-emerald-800"
    case "warning":
      return "border-amber-100 bg-amber-50 text-amber-800"
    case "blocked":
      return "border-red-100 bg-red-50 text-red-800"
    case "unknown":
      return "border-stone-200 bg-stone-50 text-stone-700"
  }
}

function AdvancedRunStatusPill({ status }: { status: AdvancedRunStatusView }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${advancedToneClassName(status.tone)}`}
    >
      {status.label}
    </span>
  )
}

function AdvancedRunSummaryStrip({ cards }: { cards: AdvancedRunSummaryCard[] }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.id}
          className={`rounded-xl border px-3 py-2 ${advancedToneClassName(card.tone)}`}
        >
          <div className="text-[11px] font-semibold opacity-80">{card.label}</div>
          <div className="mt-1 text-lg font-semibold">{card.value}</div>
        </div>
      ))}
    </div>
  )
}

function AdvancedRunListMeta({
  item,
  formatTime,
  text,
  displayText,
}: {
  item: AdvancedRunListItemView
  formatTime: (value: number) => string
  text: (ko: string, en: string) => string
  displayText: (value: string) => string
}) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2 text-[11px] text-stone-600">
        <AdvancedRunStatusPill status={item.status} />
        <span className="rounded-full bg-stone-100 px-2.5 py-1">
          {text("채널", "Channel")} {item.channelLabel}
        </span>
        <span className="rounded-full bg-stone-100 px-2.5 py-1">
          {text("요청자", "Requester")} {displayText(item.requesterLabel)}
        </span>
      </div>
      <div className="grid gap-1 text-[11px] leading-4 text-stone-500">
        <div>
          {text("시작", "Started")}: {formatTime(item.startedAt)}
        </div>
        <div>
          {text("최근", "Updated")}: {formatTime(item.updatedAt)}
        </div>
        <CollapsibleText
          value={displayText(item.resultSummary || item.actionHint)}
          threshold={120}
          clampLines={2}
          showMoreLabel={text("전체 보기", "Show more")}
          showLessLabel={text("접기", "Show less")}
          className="break-words [overflow-wrap:anywhere]"
          buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
        />
      </div>
    </div>
  )
}

function AdvancedRunOperationalPanel({
  item,
  text,
  displayText,
  formatTime,
}: {
  item: AdvancedRunListItemView
  text: (ko: string, en: string) => string
  displayText: (value: string) => string
  formatTime: (value: number) => string
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">
            {text("운영 요약", "Operational summary")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              "실행 상태, 전달 상태, 요청 채널을 분리해서 표시합니다.",
              "Shows execution, delivery, and request channel separately.",
            )}
          </div>
        </div>
        <AdvancedRunStatusPill status={item.status} />
      </div>
      <div className="mt-4 grid gap-3 text-xs text-stone-600 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="font-semibold text-stone-800">{text("요청 채널", "Request channel")}</div>
          <div className="mt-1">{item.sourceLabel}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="font-semibold text-stone-800">{text("결과 채널", "Result channel")}</div>
          <div className="mt-1">{item.channelLabel}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="font-semibold text-stone-800">{text("시작", "Started")}</div>
          <div className="mt-1">{formatTime(item.startedAt)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="font-semibold text-stone-800">
            {item.finishedAt ? text("종료", "Finished") : text("최근 갱신", "Updated")}
          </div>
          <div className="mt-1">{formatTime(item.finishedAt ?? item.updatedAt)}</div>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
        <div className="font-semibold text-stone-800">{text("상태 설명", "Status note")}</div>
        <CollapsibleText
          value={displayText(item.status.summary)}
          threshold={160}
          clampLines={2}
          showMoreLabel={text("전체 보기", "Show more")}
          showLessLabel={text("접기", "Show less")}
          className="mt-1 break-words [overflow-wrap:anywhere]"
          buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
        />
        <CollapsibleText
          value={displayText(item.actionHint)}
          threshold={160}
          clampLines={2}
          showMoreLabel={text("전체 보기", "Show more")}
          showLessLabel={text("접기", "Show less")}
          className="mt-2 break-words [overflow-wrap:anywhere]"
          buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
        />
        {item.duplicateExecutionRisk ? (
          <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-amber-800">
            {text(
              "중복 응답 또는 중복 도구 실행 위험이 감지됐습니다.",
              "Duplicate answer or duplicate tool execution risk detected.",
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AdvancedDiagnosticsSummaryPanel({
  statuses,
  doctorGuides,
  doctorLoading,
  doctorError,
  onRefreshDoctor,
  text,
  displayText,
}: {
  statuses: AdvancedDiagnosticStatusView[]
  doctorGuides: AdvancedDoctorGuideView[]
  doctorLoading: boolean
  doctorError: string
  onRefreshDoctor: () => void
  text: (ko: string, en: string) => string
  displayText: (value: string) => string
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">
            {text("진단 요약", "Diagnostics summary")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              "고급 화면은 조치 중심 요약만 보여주고 원본 이벤트는 어드민/감사 화면으로 분리합니다.",
              "Advanced view shows action-oriented summaries; raw events are kept in admin/audit views.",
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefreshDoctor}
          disabled={doctorLoading}
          className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-400"
        >
          {doctorLoading ? text("확인 중", "Checking") : text("진단 갱신", "Refresh doctor")}
        </button>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {statuses.map((status) => (
          <div
            key={status.key}
            className={`rounded-xl border px-3 py-3 text-xs leading-5 ${diagnosticToneClassName(status.status)}`}
          >
            <div className="font-semibold">
              {status.label} · {status.status}
            </div>
            <CollapsibleText
              value={displayText(status.summary)}
              threshold={140}
              clampLines={2}
              showMoreLabel={text("전체 보기", "Show more")}
              showLessLabel={text("접기", "Show less")}
              className="mt-1 break-words [overflow-wrap:anywhere]"
              buttonClassName="mt-1 inline-flex text-[11px] font-semibold underline-offset-2 hover:underline"
            />
            <CollapsibleText
              value={displayText(status.action)}
              threshold={140}
              clampLines={2}
              showMoreLabel={text("전체 보기", "Show more")}
              showLessLabel={text("접기", "Show less")}
              className="mt-1 break-words opacity-80 [overflow-wrap:anywhere]"
              buttonClassName="mt-1 inline-flex text-[11px] font-semibold underline-offset-2 hover:underline"
            />
          </div>
        ))}
      </div>
      {doctorError ? (
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {displayText(doctorError)}
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {doctorGuides.map((guide) => (
          <div
            key={guide.key}
            className={`rounded-xl border px-3 py-3 text-xs leading-5 ${doctorToneClassName(guide.status)}`}
          >
            <div className="font-semibold">
              {displayText(guide.label)} · {guide.status}
            </div>
            <CollapsibleText
              value={displayText(guide.message)}
              threshold={140}
              clampLines={2}
              showMoreLabel={text("전체 보기", "Show more")}
              showLessLabel={text("접기", "Show less")}
              className="mt-1 break-words [overflow-wrap:anywhere]"
              buttonClassName="mt-1 inline-flex text-[11px] font-semibold underline-offset-2 hover:underline"
            />
            <CollapsibleText
              value={displayText(guide.guide)}
              threshold={140}
              clampLines={2}
              showMoreLabel={text("전체 보기", "Show more")}
              showLessLabel={text("접기", "Show less")}
              className="mt-1 break-words opacity-80 [overflow-wrap:anywhere]"
              buttonClassName="mt-1 inline-flex text-[11px] font-semibold underline-offset-2 hover:underline"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Link
          to="/advanced/audit"
          className="inline-flex min-h-11 items-center rounded-xl border border-stone-200 px-3 py-2 font-semibold text-stone-700 hover:bg-stone-50"
        >
          {text("감사 로그 열기", "Open audit logs")}
        </Link>
        <Link
          to="/admin"
          className="inline-flex min-h-11 items-center rounded-xl border border-stone-200 px-3 py-2 font-semibold text-stone-700 hover:bg-stone-50"
        >
          {text("어드민 원본 보기", "Open admin raw view")}
        </Link>
      </div>
    </div>
  )
}

function TaskDiagnosticsPanel({
  card,
  text,
  displayText,
}: {
  card: TaskMonitorCard
  text: (ko: string, en: string) => string
  displayText: (value: string) => string
}) {
  const diagnostics = card.diagnostics
  const continuity = card.continuity
  const hasDetails = Boolean(
    diagnostics ||
      continuity?.lastGoodState ||
      continuity?.pendingApprovals.length ||
      continuity?.pendingDelivery.length ||
      continuity?.failedRecoveryKey,
  )
  if (!hasDetails) return null

  const promptSourceCount =
    diagnostics?.promptSources.length ?? diagnostics?.promptSourceIds.length ?? 0
  const promptSourceLabel =
    promptSourceCount > 0
      ? text(`기준 ${promptSourceCount}개 기록됨`, `${promptSourceCount} baselines recorded`)
      : text("기록 없음", "Not recorded")
  const latencyLabel = diagnostics?.latencyEvents.length
    ? diagnostics.latencyEvents.join(" · ")
    : text("기록 없음", "Not recorded")
  const memoryLabel = diagnostics?.memoryEvents.length
    ? diagnostics.memoryEvents.join(" · ")
    : text("기록 없음", "Not recorded")
  const toolLabel = diagnostics?.toolEvents.length
    ? diagnostics.toolEvents.join(" · ")
    : continuity?.lastToolReceipt
      ? continuity.lastToolReceipt
      : text("기록 없음", "Not recorded")
  const deliveryTraceLabel = diagnostics?.deliveryEvents.length
    ? diagnostics.deliveryEvents.join(" · ")
    : continuity?.lastDeliveryReceipt
      ? continuity.lastDeliveryReceipt
      : text("기록 없음", "Not recorded")
  const recoveryLabel = diagnostics?.recoveryEvents.length
    ? diagnostics.recoveryEvents.join(" · ")
    : text("기록 없음", "Not recorded")
  const pendingApprovalLabel = continuity?.pendingApprovals.length
    ? continuity.pendingApprovals.join(", ")
    : text("없음", "None")
  const pendingDeliveryLabel = continuity?.pendingDelivery.length
    ? continuity.pendingDelivery.join(", ")
    : text("없음", "None")

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
      <div className="text-xs font-semibold text-stone-500">
        {text("운영 진단", "Operational diagnostics")}
      </div>
      <div className="mt-3 grid gap-3 text-xs leading-5 text-stone-600 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
          <div className="font-semibold text-stone-800">
            {text("적용된 내부 지침", "Applied internal instructions")}
          </div>
          <CollapsibleText
            value={displayText(promptSourceLabel)}
            threshold={120}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="mt-1 break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
          <div className="font-semibold text-stone-800">
            {text("응답 지연 기록", "Latency trace")}
          </div>
          <CollapsibleText
            value={displayText(latencyLabel)}
            threshold={120}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="mt-1 break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
          <div className="font-semibold text-stone-800">
            {text("메모리·벡터 기록", "Memory and vector trace")}
          </div>
          <CollapsibleText
            value={displayText(memoryLabel)}
            threshold={120}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="mt-1 break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
          <div className="font-semibold text-stone-800">
            {text("외부 도구 활동", "External tool activity")}
          </div>
          <CollapsibleText
            value={displayText(toolLabel)}
            threshold={120}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="mt-1 break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
          <div className="font-semibold text-stone-800">
            {text("결과 전달 기록", "Result delivery activity")}
          </div>
          <CollapsibleText
            value={displayText(deliveryTraceLabel)}
            threshold={120}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="mt-1 break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
          <div className="font-semibold text-stone-800">{text("복구 기록", "Recovery trace")}</div>
          <CollapsibleText
            value={displayText(recoveryLabel)}
            threshold={120}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="mt-1 break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
          <div className="font-semibold text-stone-800">
            {text("대기 중인 승인", "Pending approvals")}
          </div>
          <CollapsibleText
            value={displayText(pendingApprovalLabel)}
            threshold={120}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="mt-1 break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
          <div className="font-semibold text-stone-800">
            {text("대기 중인 전달", "Pending delivery")}
          </div>
          <CollapsibleText
            value={displayText(pendingDeliveryLabel)}
            threshold={120}
            clampLines={2}
            showMoreLabel={text("전체 보기", "Show more")}
            showLessLabel={text("접기", "Show less")}
            className="mt-1 break-words [overflow-wrap:anywhere]"
            buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
          />
        </div>
      </div>
      {continuity?.lastGoodState ||
      continuity?.failedRecoveryKey ||
      diagnostics?.recoveryEvents.length ? (
        <div className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600">
          {continuity?.lastGoodState ? (
            <div>
              {text("최근 정상 상태", "Last good state")}: {displayText(continuity.lastGoodState)}
            </div>
          ) : null}
          {continuity?.failedRecoveryKey ? (
            <div>
              {text("반복 중단 키", "Duplicate stop key")}:{" "}
              {displayText(continuity.failedRecoveryKey)}
            </div>
          ) : null}
          {diagnostics?.recoveryEvents.length ? (
            <div>
              {text("복구 기록", "Recovery trace")}:{" "}
              {displayText(diagnostics.recoveryEvents.join(" · "))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function statusLabel(
  status: OperationsHealthItem["status"],
  text: (ko: string, en: string) => string,
): string {
  switch (status) {
    case "ok":
      return text("정상", "OK")
    case "degraded":
      return text("저하", "Degraded")
    case "down":
      return text("장애", "Down")
  }
}

function statusClassName(status: OperationsHealthItem["status"]): string {
  switch (status) {
    case "ok":
      return "border-emerald-100 bg-emerald-50 text-emerald-800"
    case "degraded":
      return "border-amber-100 bg-amber-50 text-amber-800"
    case "down":
      return "border-rose-100 bg-rose-50 text-rose-800"
  }
}

function healthItemLabel(
  key: OperationsHealthItem["key"],
  text: (ko: string, en: string) => string,
): string {
  switch (key) {
    case "overall":
      return text("전체", "Overall")
    case "memory":
      return text("메모리", "Memory")
    case "vector":
      return text("벡터", "Vector")
    case "schedule":
      return text("예약", "Schedule")
    case "channel":
      return text("채널", "Channel")
  }
}

function issueKindLabel(
  kind: OperationsSummary["repeatedIssues"][number]["kind"],
  text: (ko: string, en: string) => string,
): string {
  switch (kind) {
    case "memory":
      return text("메모리", "Memory")
    case "vector":
      return text("벡터", "Vector")
    case "schedule":
      return text("예약", "Schedule")
    case "channel":
      return text("채널", "Channel")
    case "tool":
      return text("외부 도구", "External tool")
    case "provider":
      return text("AI 연결", "AI connection")
    case "run":
      return text("실행", "Run")
  }
}

function OperationsHealthPanel({
  summary,
  diagnosticMode,
  cleanupRunning,
  onCleanupStale,
  text,
  displayText,
  formatTime,
}: {
  summary: OperationsSummary | null
  diagnosticMode: boolean
  cleanupRunning: boolean
  onCleanupStale: () => void
  text: (ko: string, en: string) => string
  displayText: (value: string) => string
  formatTime: (value: number) => string
}) {
  if (!summary) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-500">
        {text("운영 상태를 불러오는 중입니다.", "Loading operational health.")}
      </div>
    )
  }

  const healthItems = [
    summary.health.overall,
    summary.health.memory,
    summary.health.vector,
    summary.health.schedule,
    summary.health.channel,
  ]
  const staleTotal = summary.stale.total

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">
            {text("운영 상태", "Operational health")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              "반복 오류와 오래된 대기 상태를 요약합니다.",
              "Summarizes repeated issues and old waiting states.",
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onCleanupStale}
          disabled={cleanupRunning || staleTotal === 0}
          className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-400"
        >
          {cleanupRunning
            ? text("정리 중", "Cleaning")
            : text("오래된 대기 정리", "Clean old waits")}
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {healthItems.map((item) => (
          <div
            key={item.key}
            className={`rounded-xl border px-3 py-3 ${statusClassName(item.status)}`}
          >
            <div className="text-[11px] font-semibold">{healthItemLabel(item.key, text)}</div>
            <div className="mt-1 text-sm font-semibold">{statusLabel(item.status, text)}</div>
            {diagnosticMode ? (
              <CollapsibleText
                value={`${displayText(item.reason)}${item.lastAt ? ` · ${formatTime(item.lastAt)}` : ""}`}
                threshold={100}
                clampLines={2}
                showMoreLabel={text("전체 보기", "Show more")}
                showLessLabel={text("접기", "Show less")}
                className="mt-1 break-words text-[11px] leading-4 opacity-80 [overflow-wrap:anywhere]"
                buttonClassName="mt-1 inline-flex text-[11px] font-semibold underline-offset-2 hover:underline"
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
          <div className="text-xs font-semibold text-stone-600">
            {text("반복 오류", "Repeated issues")}
          </div>
          <div className="mt-2 space-y-2 text-xs text-stone-600">
            {summary.repeatedIssues.length > 0 ? (
              summary.repeatedIssues.slice(0, 5).map((issue) => (
                <div
                  key={issue.key}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-stone-800">
                      {issueKindLabel(issue.kind, text)}
                    </span>
                    <span>
                      {statusLabel(issue.status, text)} · {issue.count}
                    </span>
                  </div>
                  <CollapsibleText
                    value={`${displayText(issue.sample)}${diagnosticMode && issue.lastAt ? ` · ${formatTime(issue.lastAt)}` : ""}`}
                    threshold={140}
                    clampLines={2}
                    showMoreLabel={text("전체 보기", "Show more")}
                    showLessLabel={text("접기", "Show less")}
                    className="mt-1 break-words leading-5 [overflow-wrap:anywhere]"
                    buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                  />
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-stone-200 bg-white px-3 py-3 text-stone-500">
                {text("반복 오류가 없습니다.", "No repeated issues.")}
              </div>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
          <div className="text-xs font-semibold text-stone-600">
            {text("오래된 대기", "Old waits")}
          </div>
          <div className="mt-2 text-sm font-semibold text-stone-900">{staleTotal}</div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              `승인 대기 ${summary.stale.pendingApprovals.length}개, 전달 대기 ${summary.stale.pendingDeliveries.length}개, 실행 대기 ${summary.stale.runs.length}개`,
              `${summary.stale.pendingApprovals.length} approvals, ${summary.stale.pendingDeliveries.length} deliveries, ${summary.stale.runs.length} runs`,
            )}
          </div>
          {diagnosticMode && staleTotal > 0 ? (
            <div className="mt-3 space-y-2 text-xs text-stone-600">
              {[
                ...summary.stale.pendingApprovals,
                ...summary.stale.pendingDeliveries,
                ...summary.stale.runs,
              ]
                .slice(0, 5)
                .map((item) => (
                  <div
                    key={item.runId}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2"
                  >
                    <div className="font-semibold text-stone-800">{displayText(item.reason)}</div>
                    <div className="mt-1 break-words [overflow-wrap:anywhere]">
                      {text("실행 항목 연결됨", "Run item linked")} · {formatTime(item.updatedAt)}
                    </div>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function memoryTraceScopeLabel(
  scope: string | null,
  text: (ko: string, en: string) => string,
): string {
  const normalized = scope?.trim().toLowerCase()
  if (!normalized || normalized === "unknown") return text("범위 확인 필요", "Scope needs check")
  if (normalized === "agent") return text("에이전트 기억", "Agent memory")
  if (normalized === "project") return text("프로젝트 기억", "Project memory")
  if (normalized === "workspace") return text("작업 공간 기억", "Workspace memory")
  if (normalized === "session") return text("현재 대화 기억", "Session memory")
  if (normalized === "global") return text("공통 기억", "Shared memory")
  return scope ?? text("범위 확인 필요", "Scope needs check")
}

function memoryTraceResultSourceLabel(
  source: string,
  text: (ko: string, en: string) => string,
): string {
  const normalized = source.trim().toLowerCase()
  if (!normalized || normalized === "unknown") return text("출처 확인 필요", "Source needs check")
  if (normalized === "vector" || normalized === "vector_search")
    return text("벡터 검색", "Vector search")
  if (normalized === "keyword" || normalized === "fts" || normalized === "full_text")
    return text("문장 검색", "Text search")
  if (normalized === "cache") return text("캐시", "Cache")
  if (normalized === "long_term" || normalized === "long_term_memory")
    return text("장기 기억", "Long-term memory")
  if (normalized === "short_term" || normalized === "short_term_memory")
    return text("단기 기억", "Short-term memory")
  return source
}

function memoryTraceReasonLabel(
  reason: string | null,
  text: (ko: string, en: string) => string,
): string {
  const normalized = reason?.trim().toLowerCase()
  if (!normalized || normalized === "accepted")
    return text("답변 근거로 사용됨", "Used as answer context")
  if (normalized === "rejected") return text("답변 근거에서 제외됨", "Excluded from answer context")
  if (normalized === "fallback") return text("대체 검색으로 사용됨", "Used as fallback search")
  return reason ?? text("답변 근거로 사용됨", "Used as answer context")
}

function MemoryTracePanel({
  traces,
  loading,
  error,
  text,
  displayText,
  formatTime,
}: {
  traces: MemoryAccessTraceItem[]
  loading: boolean
  error: string
  text: (ko: string, en: string) => string
  displayText: (value: string) => string
  formatTime: (value: number) => string
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">
            {text("메모리 참조 추적", "Memory access trace")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              "답변에 사용된 메모리 참조와 출처 검증 상태를 운영 진단용으로 표시합니다.",
              "Shows memory references and source verification status used by the answer.",
            )}
          </div>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
          {traces.length}
        </span>
      </div>
      {error ? (
        <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {displayText(error)}
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {traces.length > 0 ? (
          traces.slice(0, 8).map((trace) => {
            const score =
              trace.score == null
                ? text("확인 필요", "Needs check")
                : Number(trace.score).toFixed(3)
            const latency =
              trace.latency_ms == null ? text("확인 필요", "Needs check") : `${trace.latency_ms}ms`
            const memoryReferenceStatus = trace.chunk_id
              ? text("기록됨", "Recorded")
              : text("확인 필요", "Needs check")
            const sourceVerificationStatus = trace.source_checksum
              ? text("검증 기준 연결됨", "Verification linked")
              : text("확인 필요", "Needs check")
            return (
              <div
                key={trace.id}
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-600"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-stone-900">
                    {memoryTraceScopeLabel(trace.scope, text)} ·{" "}
                    {memoryTraceResultSourceLabel(trace.result_source, text)}
                  </span>
                  <span>{formatTime(trace.created_at)}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    {text("메모리 참조", "Memory reference")}: {memoryReferenceStatus}
                  </div>
                  <div>
                    {text("출처 검증", "Source verification")}: {sourceVerificationStatus}
                  </div>
                  <div>
                    {text("점수", "Score")}: {score}
                  </div>
                  <div>
                    {text("지연", "Latency")}: {latency}
                  </div>
                </div>
                <CollapsibleText
                  value={displayText(memoryTraceReasonLabel(trace.reason, text))}
                  threshold={140}
                  clampLines={2}
                  showMoreLabel={text("전체 보기", "Show more")}
                  showLessLabel={text("접기", "Show less")}
                  className="mt-2 break-words text-stone-500 [overflow-wrap:anywhere]"
                  buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                />
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-500">
            {loading
              ? text("메모리 추적을 불러오는 중입니다.", "Loading memory trace.")
              : text("이 실행의 메모리 참조 기록이 없습니다.", "No memory trace for this run.")}
          </div>
        )}
      </div>
    </div>
  )
}

function retrievalStatusLabel(
  status: string | null | undefined,
  text: (ko: string, en: string) => string,
): string {
  const normalized = status?.trim().toLowerCase()
  if (!normalized || normalized === "unknown" || normalized === "none")
    return text("확인 필요", "Needs check")
  if (normalized === "delivered" || normalized === "completed" || normalized === "sent")
    return text("전달 완료", "Delivered")
  if (normalized === "suppressed") return text("중복 억제됨", "Suppressed")
  if (normalized === "failed" || normalized === "error") return text("전달 실패", "Delivery failed")
  if (normalized === "pending" || normalized === "queued") return text("대기 중", "Pending")
  return status ?? text("확인 필요", "Needs check")
}

function retrievalStopReasonLabel(
  reason: string | null | undefined,
  text: (ko: string, en: string) => string,
): string {
  const normalized = reason?.trim().toLowerCase()
  if (!normalized || normalized === "none" || normalized === "unknown")
    return text("중단 없음", "No stop")
  if (normalized.includes("conflict")) return text("근거 충돌", "Evidence conflict")
  if (normalized.includes("dedupe")) return text("중복 억제", "Duplicate suppressed")
  if (normalized.includes("delivery")) return text("전달 단계 중단", "Delivery stopped")
  if (normalized.includes("source")) return text("검색 출처 확인 필요", "Source needs check")
  return reason ?? text("중단 없음", "No stop")
}

function retrievalEventKindLabel(
  kind: RetrievalTimeline["events"][number]["kind"],
  text: (ko: string, en: string) => string,
): string {
  switch (kind) {
    case "session":
      return text("요청 시작", "Session")
    case "attempt":
      return text("검색 시도", "Search attempt")
    case "source":
      return text("출처 확인", "Source check")
    case "diagnosis":
      return text("LLM 결과 진단", "LLM result diagnosis")
    case "planner":
      return text("검색 계획", "Retrieval plan")
    case "delivery":
      return text("결과 전달", "Delivery")
    case "dedupe":
      return text("중복 억제", "Dedupe")
    case "stop":
      return text("중단 판단", "Stop decision")
    case "diagnostic":
      return text("진단", "Diagnostic")
  }
}

function retrievalEventTypeLabel(
  eventType: string,
  text: (ko: string, en: string) => string,
): string {
  const normalized = eventType.trim().toLowerCase()
  if (!normalized || normalized === "unknown") return text("세부 확인 필요", "Details need check")
  if (normalized.includes("start")) return text("시작", "Started")
  if (normalized.includes("complete") || normalized.includes("success"))
    return text("완료", "Completed")
  if (normalized.includes("fail") || normalized.includes("error")) return text("실패", "Failed")
  if (normalized.includes("result_diagnosis")) return text("LLM 결과 진단", "LLM result diagnosis")
  if (normalized.includes("delivery")) return text("전달", "Delivery")
  if (normalized.includes("dedupe")) return text("중복 확인", "Duplicate check")
  return eventType
}

function retrievalSourceLabel(
  event: RetrievalTimeline["events"][number],
  text: (ko: string, en: string) => string,
): string {
  if (event.source.domain) return text("검색 출처 확인됨", "Search source checked")
  if (event.source.toolName || event.source.method)
    return text("검색 도구 사용됨", "Search tool used")
  return ""
}

function RetrievalEvidencePanel({
  timeline,
  loading,
  error,
  text,
  displayText,
  formatTime,
}: {
  timeline: RetrievalTimeline | null
  loading: boolean
  error: string
  text: (ko: string, en: string) => string
  displayText: (value: string) => string
  formatTime: (value: number) => string
}) {
  const summary = timeline?.summary ?? null
  const events = timeline?.events ?? []
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">
            {text("검색 근거", "Retrieval evidence")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              "검색 증거 수집, LLM 결과 진단, 전달 상태를 실행 기록에서 재구성합니다.",
              "Reconstructs evidence acquisition, LLM result diagnosis, and delivery from run records.",
            )}
          </div>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
          {summary?.total ?? 0}
        </span>
      </div>
      {error ? (
        <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {displayText(error)}
        </div>
      ) : null}
      {summary ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {text("시도", "Attempts")}: {summary.attempts}
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {text("LLM 결과 진단", "LLM diagnoses")}: {summary.diagnoses}
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {text("전달", "Delivery")}: {retrievalStatusLabel(summary.finalDeliveryStatus, text)}
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {text("중복 억제", "Dedupe")}: {summary.dedupeSuppressed}
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {text("중단 사유", "Stop reason")}: {retrievalStopReasonLabel(summary.stopReason, text)}
          </div>
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {events.length > 0 ? (
          events.slice(0, 12).map((event) => {
            const sourceLabel = retrievalSourceLabel(event, text)
            return (
              <div
                key={event.id}
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-600"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-stone-900">
                    {retrievalEventKindLabel(event.kind, text)} ·{" "}
                    {retrievalEventTypeLabel(event.eventType, text)}
                  </span>
                  <span>{formatTime(event.at)}</span>
                </div>
                <CollapsibleText
                  value={displayText(event.summary)}
                  threshold={140}
                  clampLines={2}
                  showMoreLabel={text("전체 보기", "Show more")}
                  showLessLabel={text("접기", "Show less")}
                  className="mt-1 break-words leading-5 [overflow-wrap:anywhere]"
                  buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                />
                {sourceLabel || event.duplicate ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-500">
                    {sourceLabel ? (
                      <span className="rounded-full bg-white px-2 py-1">
                        {displayText(sourceLabel)}
                      </span>
                    ) : null}
                    {event.duplicate ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                        {text("중복 억제", "Duplicate suppressed")} {event.duplicate.occurrence}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-500">
            {loading
              ? text("검색 근거를 불러오는 중입니다.", "Loading retrieval evidence.")
              : text("이 실행의 검색 근거 기록이 없습니다.", "No retrieval evidence for this run.")}
          </div>
        )}
      </div>
    </div>
  )
}

function ChannelSmokePanel({
  text,
  formatTime,
}: {
  text: (ko: string, en: string) => string
  formatTime: (value: number) => string
}) {
  const [runs, setRuns] = useState<ChannelSmokeRunSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [runningChannel, setRunningChannel] = useState<ChannelSmokeChannel | "all" | null>(null)
  const [error, setError] = useState("")

  const loadRuns = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const response = await api.channelSmokeRuns(5)
      setRuns(response.runs)
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const startDryRun = useCallback(
    async (channel: ChannelSmokeChannel | "all"): Promise<void> => {
      setRunningChannel(channel)
      try {
        await api.startChannelSmokeRun({
          mode: "dry-run",
          ...(channel === "all" ? {} : { channel }),
        })
        await loadRuns()
        setError("")
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setRunningChannel(null)
      }
    },
    [loadRuns],
  )

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const channels: Array<{ key: ChannelSmokeChannel | "all"; label: string }> = [
    { key: "all", label: text("전체", "All") },
    { key: "webui", label: "WebUI" },
    { key: "telegram", label: "Telegram" },
    { key: "slack", label: "Slack" },
  ]

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-900">
            {text("채널 Smoke", "Channel smoke")}
          </div>
          <div className="mt-1 text-xs leading-5 text-stone-500">
            {text(
              "WebUI, Telegram, Slack 전달 경로와 승인 UI를 dry-run으로 점검합니다.",
              "Checks WebUI, Telegram, and Slack delivery paths and approval UI with dry-run smoke tests.",
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadRuns()}
          disabled={loading || runningChannel !== null}
          className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-400"
        >
          {loading ? text("갱신 중", "Refreshing") : text("새로고침", "Refresh")}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {channels.map((channel) => (
          <button
            key={channel.key}
            type="button"
            onClick={() => void startDryRun(channel.key)}
            disabled={runningChannel !== null}
            className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-400"
          >
            {runningChannel === channel.key
              ? text("실행 중", "Running")
              : text(`${channel.label} 점검`, `${channel.label} check`)}
          </button>
        ))}
      </div>
      {error ? (
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {error}
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {runs.length > 0 ? (
          runs.map((run) => (
            <div
              key={run.id}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-600"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-stone-900">{run.status}</span>
                <span>{formatTime(run.startedAt)}</span>
              </div>
              <CollapsibleText
                value={run.summary ?? text("요약 없음", "No summary")}
                threshold={140}
                clampLines={2}
                showMoreLabel={text("전체 보기", "Show more")}
                showLessLabel={text("접기", "Show less")}
                className="mt-1 break-words leading-5 text-stone-500 [overflow-wrap:anywhere]"
                buttonClassName="mt-1 inline-flex text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-2 py-1">
                  {text("통과", "Passed")} {run.counts.passed}
                </span>
                <span className="rounded-full bg-white px-2 py-1">
                  {text("실패", "Failed")} {run.counts.failed}
                </span>
                <span className="rounded-full bg-white px-2 py-1">
                  {text("건너뜀", "Skipped")} {run.counts.skipped}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-xs text-stone-500">
            {loading
              ? text("결과를 불러오는 중입니다.", "Loading results.")
              : text("아직 smoke 결과가 없습니다.", "No smoke results yet.")}
          </div>
        )}
      </div>
    </div>
  )
}

export function RunsDiagnosticPage({ onExit }: { onExit: () => void }) {
  const { text, displayText, formatTime } = useUiI18n()
  const {
    runs,
    executionOutcomes,
    tasks,
    operationsSummary,
    selectedRunId,
    ensureInitialized,
    selectRun,
    cancelRun,
    deleteRunHistory,
    clearHistoricalRunHistory,
    cleanupStaleRuns,
  } = useRunsStore()
  const [viewMode, setViewMode] = useState<TaskMonitorViewMode>("diagnostic")
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [cleanupNotice, setCleanupNotice] = useState<AdvancedCleanupNotice | null>(null)
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null)
  const [doctorLoading, setDoctorLoading] = useState(false)
  const [doctorError, setDoctorError] = useState("")
  const [memoryTrace, setMemoryTrace] = useState<MemoryAccessTraceItem[]>([])
  const [memoryTraceLoading, setMemoryTraceLoading] = useState(false)
  const [memoryTraceError, setMemoryTraceError] = useState("")
  const [retrievalTimeline, setRetrievalTimeline] = useState<RetrievalTimeline | null>(null)
  const [retrievalTimelineLoading, setRetrievalTimelineLoading] = useState(false)
  const [retrievalTimelineError, setRetrievalTimelineError] = useState("")
  const [runtimeInspector, setRuntimeInspector] = useState<RunRuntimeInspectorProjection | null>(
    null,
  )
  const [runtimeInspectorLoading, setRuntimeInspectorLoading] = useState(false)
  const [runtimeInspectorError, setRuntimeInspectorError] = useState("")
  const [selectedSubSessionId, setSelectedSubSessionId] = useState<string | null>(null)
  const [artifactCleanupDisplay, setArtifactCleanupDisplay] =
    useState<AdminArtifactCleanupDisplay | null>(null)
  const [artifactCleanupConfirmation, setArtifactCleanupConfirmation] = useState("")
  const [artifactCleanupReleaseOutputDir, setArtifactCleanupReleaseOutputDir] = useState("")
  const [artifactCleanupLoading, setArtifactCleanupLoading] = useState(false)
  const [artifactCleanupRunning, setArtifactCleanupRunning] = useState(false)
  const [artifactCleanupMessage, setArtifactCleanupMessage] = useState("")

  useEffect(() => {
    ensureInitialized()
  }, [ensureInitialized])

  const cards = buildTaskMonitorCards(tasks, runs, text)
  const advancedRunItems = buildAdvancedRunListItems(cards, text)
  const advancedRunSummaryCards = buildAdvancedRunSummaryCards(advancedRunItems, text)
  const selectedCard =
    cards.find((card) => card.key === selectedRunId || card.representative.id === selectedRunId) ??
    cards[0] ??
    null
  const selectedAdvancedRunItem =
    advancedRunItems.find((item) => item.key === selectedCard?.key) ?? advancedRunItems[0] ?? null
  const selectedRun = selectedCard?.representative ?? null
  const selectedRunEffectId = selectedRun?.id ?? null
  const selectedTimeline = selectedCard?.timeline ?? []
  const visibleTimeline = filterTaskTimelineForMode(selectedTimeline, viewMode)
  const selectedRequestText = selectedCard?.requestText ?? selectedRun?.prompt ?? ""
  const selectedDeliveryLabel = selectedCard
    ? describeTaskDeliveryStatus(selectedCard.delivery.status, text)
    : ""
  const diagnosticMode = viewMode === "diagnostic"
  const historicalCards = cards.filter((card) =>
    ["completed", "failed", "cancelled", "interrupted"].includes(card.representative.status),
  )
  const canDeleteSelected = Boolean(
    selectedRun && ["completed", "failed", "cancelled", "interrupted"].includes(selectedRun.status),
  )
  const diagnosticStatuses = buildAdvancedDiagnosticStatuses(
    operationsSummary,
    retrievalTimeline,
    text,
  )
  const doctorGuides = buildDoctorActionGuides(doctorReport, text)
  const cardsWithAdvancedRunItems = cards.map((card) => ({
    card,
    advancedRunItem: advancedRunItems.find((item) => item.key === card.key),
  }))

  const refreshDoctor = useCallback(async (): Promise<void> => {
    setDoctorLoading(true)
    try {
      const response = await api.doctor("quick")
      setDoctorReport(response.report)
      setDoctorError("")
    } catch (error) {
      setDoctorError(error instanceof Error ? error.message : String(error))
    } finally {
      setDoctorLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!diagnosticMode || doctorReport || doctorLoading) return
    void refreshDoctor()
  }, [diagnosticMode, doctorLoading, doctorReport, refreshDoctor])

  useEffect(() => {
    if (!diagnosticMode || !selectedRunEffectId) {
      setMemoryTrace([])
      setMemoryTraceError("")
      setMemoryTraceLoading(false)
      return
    }
    let cancelled = false
    setMemoryTraceLoading(true)
    api
      .runMemoryTrace(selectedRunEffectId, 100)
      .then(
        (response) => {
          if (cancelled) return
          setMemoryTrace(response.traces)
          setMemoryTraceError("")
        },
        (error) => {
          if (cancelled) return
          setMemoryTrace([])
          setMemoryTraceError(error instanceof Error ? error.message : String(error))
        },
      )
      .finally(() => {
        if (!cancelled) setMemoryTraceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [diagnosticMode, selectedRunEffectId])

  useEffect(() => {
    if (!diagnosticMode || !selectedRunEffectId) {
      setRetrievalTimeline(null)
      setRetrievalTimelineError("")
      setRetrievalTimelineLoading(false)
      return
    }
    let cancelled = false
    setRetrievalTimelineLoading(true)
    api
      .runRetrievalTimeline(selectedRunEffectId, 500)
      .then(
        (response) => {
          if (cancelled) return
          setRetrievalTimeline(response.timeline)
          setRetrievalTimelineError("")
        },
        (error) => {
          if (cancelled) return
          setRetrievalTimeline(null)
          setRetrievalTimelineError(error instanceof Error ? error.message : String(error))
        },
      )
      .finally(() => {
        if (!cancelled) setRetrievalTimelineLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [diagnosticMode, selectedRunEffectId])

  useEffect(() => {
    if (!diagnosticMode || !selectedRunEffectId) {
      setRuntimeInspector(null)
      setRuntimeInspectorError("")
      setRuntimeInspectorLoading(false)
      setSelectedSubSessionId(null)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const loadRuntimeInspector = (showLoading: boolean) => {
      if (showLoading) setRuntimeInspectorLoading(true)
      api
        .runRuntimeInspector(selectedRunEffectId)
        .then(
          (response) => {
            if (cancelled) return
            setRuntimeInspector(response.projection)
            setRuntimeInspectorError("")
            setSelectedSubSessionId((current) => {
              if (
                current &&
                response.projection.subSessions.some((item) => item.subSessionId === current)
              ) {
                return current
              }
              return response.projection.subSessions[0]?.subSessionId ?? null
            })
          },
          (error) => {
            if (cancelled) return
            setRuntimeInspector(null)
            setRuntimeInspectorError(error instanceof Error ? error.message : String(error))
          },
        )
        .finally(() => {
          if (!cancelled && showLoading) setRuntimeInspectorLoading(false)
        })
    }

    loadRuntimeInspector(true)
    timer = setInterval(() => loadRuntimeInspector(false), 5_000)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [diagnosticMode, selectedRunEffectId])

  async function handleDeleteSelected(): Promise<void> {
    if (!selectedRun) return
    const confirmed = window.confirm(
      text(
        "선택한 실행 기록을 정리할까요? 관련된 하위 실행과 전달 기록도 함께 지워집니다.",
        "Clear the selected activity record? Related child runs and delivery records will also be removed.",
      ),
    )
    if (!confirmed) return
    try {
      const result = await deleteRunHistory(selectedRun.id)
      setCleanupNotice(buildCleanupNoticeFromDeleteResult(result.deletedRunCount, text))
    } catch (error) {
      setCleanupNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        auditHint: text(
          "실행 기록 정리에 실패했습니다. 감사 로그와 서버 로그를 확인하세요.",
          "Failed to clear activity history. Check audit logs and server logs.",
        ),
      })
    }
  }

  async function handleClearHistoricalHistory(): Promise<void> {
    if (historicalCards.length === 0) return
    const confirmed = window.confirm(
      text(
        "완료된 이전 실행 기록을 모두 정리할까요? 현재 진행 중인 항목은 남겨둡니다.",
        "Clear all completed past activity records? Active items will be kept.",
      ),
    )
    if (!confirmed) return
    try {
      const result = await clearHistoricalRunHistory()
      setCleanupNotice(buildCleanupNoticeFromDeleteResult(result.deletedRunCount, text))
    } catch (error) {
      setCleanupNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        auditHint: text(
          "이전 기록 정리에 실패했습니다. 감사 로그와 서버 로그를 확인하세요.",
          "Failed to clear past activity history. Check audit logs and server logs.",
        ),
      })
    }
  }

  async function handleCleanupStaleRuns(): Promise<void> {
    if (!operationsSummary || operationsSummary.stale.total === 0 || cleanupRunning) return
    const confirmed = window.confirm(
      text(
        "오래된 승인/전달/실행 대기 상태를 정리할까요? 진행 중인 항목은 삭제하지 않고 중단 처리만 합니다.",
        "Clean old approval, delivery, and run waits? Active items will not be deleted; they will be marked interrupted.",
      ),
    )
    if (!confirmed) return
    setCleanupRunning(true)
    try {
      const result = await cleanupStaleRuns()
      setCleanupNotice(buildCleanupNoticeFromStaleResult(result, text))
    } catch (error) {
      setCleanupNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        auditHint: text(
          "오래된 대기 정리에 실패했습니다. 운영 상태와 감사 로그를 확인하세요.",
          "Failed to clean old waits. Check operational health and audit logs.",
        ),
      })
    } finally {
      setCleanupRunning(false)
    }
  }

  function artifactCleanupParams() {
    const releaseOutputDir = artifactCleanupReleaseOutputDir.trim()
    return {
      maxAgeMs: 24 * 60 * 60 * 1_000,
      ...(releaseOutputDir ? { releaseOutputDir } : {}),
    }
  }

  async function handlePreviewArtifactCleanup(): Promise<void> {
    if (artifactCleanupLoading || artifactCleanupRunning) return
    setArtifactCleanupLoading(true)
    try {
      const response = await api.adminArtifactCleanupPreview(artifactCleanupParams())
      setArtifactCleanupDisplay(response.display)
      setArtifactCleanupConfirmation(response.preview.confirmation)
      setArtifactCleanupMessage(
        text(
          "정리 대상을 확인했습니다. 정리 가능 항목이 있을 때만 실행할 수 있습니다.",
          "Cleanup targets checked. Execution is available only when eligible items exist.",
        ),
      )
    } catch (error) {
      setArtifactCleanupDisplay(null)
      setArtifactCleanupConfirmation("")
      setArtifactCleanupMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setArtifactCleanupLoading(false)
    }
  }

  async function handleExecuteArtifactCleanup(): Promise<void> {
    if (!artifactCleanupConfirmation || artifactCleanupLoading || artifactCleanupRunning) return
    const confirmed = window.confirm(
      text(
        "미리보기에서 확인한 오래된 결과물을 정리할까요?",
        "Clean the old artifacts shown in the preview?",
      ),
    )
    if (!confirmed) return
    setArtifactCleanupRunning(true)
    try {
      const response = await api.adminArtifactCleanup({
        ...artifactCleanupParams(),
        confirmation: artifactCleanupConfirmation,
      })
      setArtifactCleanupDisplay(response.display)
      setArtifactCleanupMessage(
        response.display.confirmed
          ? text(
              "결과물 정리가 완료되었습니다. 삭제 후 확인 결과는 아래에 표시됩니다.",
              "Artifact cleanup completed. Post-delete verification is shown below.",
            )
          : text(
              "정리 확인 문구가 맞지 않아 실행하지 않았습니다.",
              "Cleanup was not executed because confirmation did not match.",
            ),
      )
    } catch (error) {
      setArtifactCleanupMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setArtifactCleanupRunning(false)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-stone-100 lg:flex-row lg:overflow-hidden">
      <div className="flex w-full shrink-0 flex-col border-b border-stone-200 bg-white lg:w-[28rem] lg:border-b-0 lg:border-r">
        <div className="border-b border-stone-200 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                {text("실행 현황", "Activity Monitor")}
              </div>
              <div className="mt-2 text-xl font-semibold text-stone-900">
                {text("실행 현황", "Activity monitor")}
              </div>
              <div className="mt-2 text-xs leading-5 text-stone-500">
                {text(
                  "현재 진행 중이거나 최근에 처리된 항목을 한곳에서 확인합니다. 모두 같은 AI 연결을 공유합니다.",
                  "Review active and recent items in one place. They all share the same AI connection.",
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleClearHistoricalHistory()}
              disabled={historicalCards.length === 0}
              className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-400"
            >
              {text("이전 기록 정리", "Clear past items")}
            </button>
          </div>
          <div className="mt-4 inline-flex rounded-2xl border border-stone-200 bg-stone-50 p-1">
            {(["normal", "diagnostic"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (mode === "normal") {
                    onExit()
                    return
                  }
                  setViewMode(mode)
                }}
                className={`min-h-11 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${viewMode === mode ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
              >
                {mode === "normal" ? text("일반 보기", "Normal") : text("진단 보기", "Diagnostics")}
              </button>
            ))}
          </div>
          <AdvancedRunSummaryStrip cards={advancedRunSummaryCards} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {cardsWithAdvancedRunItems.map(({ card, advancedRunItem }) => (
              <RunStatusCard
                key={card.key}
                run={card.representative}
                outcome={executionOutcomes[card.representative.id]}
                treeNodes={card.treeNodes}
                selected={card.key === selectedCard?.key}
                onSelect={() => selectRun(card.key)}
                onCancel={
                  card.representative.canCancel
                    ? () => void cancelRun(card.representative.id)
                    : undefined
                }
                extraContent={
                  <div className="space-y-3">
                    {advancedRunItem ? (
                      <AdvancedRunListMeta
                        item={advancedRunItem}
                        formatTime={formatTime}
                        text={text}
                        displayText={displayText}
                      />
                    ) : null}
                    <TaskMonitorBadges
                      executionRecordCount={card.attempts.length}
                      checklistLabel={describeTaskChecklistProgress(card.checklist, text)}
                      deliveryLabel={describeTaskDeliveryStatus(card.delivery.status, text)}
                      text={text}
                    />
                  </div>
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 lg:overflow-y-auto">
        {cleanupNotice ? (
          <div
            className={`mb-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${cleanupNotice.kind === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-rose-100 bg-rose-50 text-rose-800"}`}
          >
            <div className="font-semibold">{displayText(cleanupNotice.message)}</div>
            <div className="text-xs opacity-80">{displayText(cleanupNotice.auditHint)}</div>
          </div>
        ) : null}
        {selectedRun ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              {selectedAdvancedRunItem ? (
                <AdvancedRunOperationalPanel
                  item={selectedAdvancedRunItem}
                  text={text}
                  displayText={displayText}
                  formatTime={formatTime}
                />
              ) : null}
              <RunSummaryPanel
                run={selectedRun}
                diagnosticMode={diagnosticMode}
                extraContent={
                  <div className="space-y-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDeleteSelected()}
                        disabled={!canDeleteSelected}
                        className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-100 disabled:text-stone-400"
                      >
                        {text("이 항목 정리", "Clear this item")}
                      </button>
                    </div>
                    <TaskChecklistPanel
                      checklist={
                        selectedCard?.checklist ?? {
                          items: [],
                          completedCount: 0,
                          actionableCount: 0,
                          failedCount: 0,
                        }
                      }
                      text={text}
                      displayText={displayText}
                    />
                    {selectedCard?.failure ? (
                      <TaskFailurePanel
                        failure={selectedCard.failure}
                        text={text}
                        displayText={displayText}
                      />
                    ) : null}
                    {selectedCard?.delivery.artifact ? (
                      <TaskArtifactPanel
                        artifact={selectedCard.delivery.artifact}
                        title={text("전달된 파일", "Delivered file")}
                        text={text}
                      />
                    ) : null}
                    {diagnosticMode && selectedCard ? (
                      <TaskDiagnosticsPanel
                        card={selectedCard}
                        text={text}
                        displayText={displayText}
                      />
                    ) : null}
                    <div
                      className={`grid gap-3 ${diagnosticMode ? "md:grid-cols-3" : "md:grid-cols-2"}`}
                    >
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                          {text("실행 횟수", "Run count")}
                        </div>
                        <div className="mt-2 text-sm font-medium text-stone-900">
                          {selectedCard?.attempts.length ?? 0}
                        </div>
                      </div>
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                          {text("결과 전달 상태", "Result delivery status")}
                        </div>
                        <div className="mt-2 text-sm font-medium text-stone-900">
                          {selectedDeliveryLabel}
                        </div>
                      </div>
                    </div>
                  </div>
                }
              />
              <div className="rounded-2xl border border-stone-200 bg-white p-5">
                <div className="mb-4 text-sm font-semibold text-stone-900">
                  {text("진행 단계", "Progress steps")}
                </div>
                <RunStepTimeline steps={selectedRun.steps} />
              </div>
            </div>
            <div className="space-y-6">
              {diagnosticMode ? (
                <Suspense
                  fallback={
                    <output className="min-h-44 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-500">
                      {text("실행 진단을 불러오는 중입니다.", "Loading run diagnostics.")}
                    </output>
                  }
                >
                  <RunRuntimeInspectorPanel
                    projection={runtimeInspector}
                    selectedSubSessionId={selectedSubSessionId}
                    onSelectSubSession={setSelectedSubSessionId}
                    loading={runtimeInspectorLoading}
                    error={runtimeInspectorError}
                  />
                </Suspense>
              ) : null}
              <OperationsHealthPanel
                summary={operationsSummary}
                diagnosticMode={diagnosticMode}
                cleanupRunning={cleanupRunning}
                onCleanupStale={() => void handleCleanupStaleRuns()}
                text={text}
                displayText={displayText}
                formatTime={formatTime}
              />
              {diagnosticMode ? (
                <ArtifactCleanupPanel
                  display={artifactCleanupDisplay}
                  loading={artifactCleanupLoading}
                  running={artifactCleanupRunning}
                  message={artifactCleanupMessage}
                  releaseOutputDir={artifactCleanupReleaseOutputDir}
                  onReleaseOutputDirChange={setArtifactCleanupReleaseOutputDir}
                  onPreview={() => void handlePreviewArtifactCleanup()}
                  onExecute={() => void handleExecuteArtifactCleanup()}
                  text={text}
                  displayText={displayText}
                  formatTime={formatTime}
                />
              ) : null}
              {diagnosticMode ? (
                <AdvancedDiagnosticsSummaryPanel
                  statuses={diagnosticStatuses}
                  doctorGuides={doctorGuides}
                  doctorLoading={doctorLoading}
                  doctorError={doctorError}
                  onRefreshDoctor={() => void refreshDoctor()}
                  text={text}
                  displayText={displayText}
                />
              ) : null}
              {diagnosticMode ? (
                <MemoryTracePanel
                  traces={memoryTrace}
                  loading={memoryTraceLoading}
                  error={memoryTraceError}
                  text={text}
                  displayText={displayText}
                  formatTime={formatTime}
                />
              ) : null}
              {diagnosticMode ? (
                <RetrievalEvidencePanel
                  timeline={retrievalTimeline}
                  loading={retrievalTimelineLoading}
                  error={retrievalTimelineError}
                  text={text}
                  displayText={displayText}
                  formatTime={formatTime}
                />
              ) : null}
              {diagnosticMode ? <ChannelSmokePanel text={text} formatTime={formatTime} /> : null}
              <RunEventFeed
                events={visibleTimeline.map((item) => ({
                  id: item.id,
                  at: item.at,
                  label: `[${item.runLabel}] ${displayText(item.label)}`,
                }))}
              />
              <div className="rounded-2xl border border-stone-200 bg-white p-5">
                <div className="mb-2 text-sm font-semibold text-stone-900">
                  {text("원래 요청", "Original request")}
                </div>
                <CollapsibleText
                  value={displayText(selectedRequestText)}
                  threshold={220}
                  clampLines={4}
                  showMoreLabel={text("전체 보기", "Show more")}
                  showLessLabel={text("접기", "Show less")}
                  className="break-words text-sm leading-6 text-stone-600 [overflow-wrap:anywhere]"
                />
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title={text("표시할 항목이 없습니다", "No items to display")}
            description={text(
              "채팅에서 메시지를 보내면 실행 이력이 여기에 표시됩니다.",
              "Items created from chat will appear here.",
            )}
          />
        )}
      </div>
    </div>
  )
}
