import React from "react"

import type {
  YeonjangActiveTabInfoAdvancedReadinessView,
  YeonjangActiveTabInfoGeneralReadinessView,
  YeonjangActiveTabInfoGeneralTargetView,
} from "../../lib/yeonjang-active-tab-info-readiness-view"
import type {
  YeonjangActiveTabInfoApprovalReceipt,
  YeonjangActiveTabInfoApprovalScope,
} from "../../lib/yeonjang-active-tab-info-approval-receipt"
import type { YeonjangBrowserActiveTabInfoPreDispatchPreview } from "../../contracts/yeonjang"
import { StatusLabel, type StatusTone } from "../ui/StatusLabel"

export interface YeonjangActiveTabInfoReadinessPanelProps {
  view: YeonjangActiveTabInfoGeneralReadinessView
  onPrimaryAction?: (action: YeonjangActiveTabInfoGeneralReadinessView["primaryAction"]) => void
}

export interface YeonjangActiveTabInfoDiagnosticsPanelProps {
  view: YeonjangActiveTabInfoAdvancedReadinessView
}

export interface YeonjangActiveTabInfoAuthorizationPromptProps {
  action: YeonjangActiveTabInfoGeneralReadinessView["primaryAction"]
  receipt?: YeonjangActiveTabInfoApprovalReceipt | null
  preview?: YeonjangBrowserActiveTabInfoPreDispatchPreview | null
  previewLoading?: boolean | undefined
  previewError?: string | null | undefined
  onApprove?: (
    action: NonNullable<YeonjangActiveTabInfoGeneralReadinessView["primaryAction"]>,
    approvalScope: Exclude<YeonjangActiveTabInfoApprovalScope, "deny">,
  ) => void
  onCancel?: () => void
}

export function YeonjangActiveTabInfoReadinessPanel({
  view,
  onPrimaryAction,
}: YeonjangActiveTabInfoReadinessPanelProps) {
  const primaryAction = view.primaryAction

  return (
    <section
      aria-labelledby="yeonjang-active-tab-info-readiness-title"
      className="space-y-4 rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white p-5 shadow-sm"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">browser.active_tab_info</p>
          <h2 id="yeonjang-active-tab-info-readiness-title" className="mt-1 text-lg font-bold text-stone-950">
            {view.title}
          </h2>
          <p className="mt-2 break-words text-sm leading-6 text-stone-600 [overflow-wrap:anywhere]">{view.summary}</p>
        </div>
        <StatusLabel tone={overallStatusTone(view.overallStatus)}>{overallStatusLabel(view.overallStatus)}</StatusLabel>
      </header>

      <dl className="grid gap-2 sm:grid-cols-3">
        <ReadinessMetric label="전체" value={view.targetCount} />
        <ReadinessMetric label="준비" value={view.readyCount} />
        <ReadinessMetric label="확인 필요" value={view.blockedCount} />
      </dl>

      {primaryAction ? (
        <div className="flex flex-col gap-3 rounded-[var(--ui-surface-radius)] border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-950">{primaryAction.label}</div>
            <p className="mt-1 break-words text-sm text-amber-900 [overflow-wrap:anywhere]">{primaryAction.targetName}</p>
          </div>
          {onPrimaryAction ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--ui-surface-radius)] border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 shadow-sm"
              onClick={() => onPrimaryAction(primaryAction)}
            >
              실행
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <ReadinessGroup title="확인할 연장" count={view.groups.blocked.count} targets={view.groups.blocked.targets} />
        <ReadinessGroup title="준비된 연장" count={view.groups.ready.count} targets={view.groups.ready.targets} />
      </div>
    </section>
  )
}

export function YeonjangActiveTabInfoAuthorizationPrompt({
  action,
  receipt = null,
  preview = null,
  previewLoading = false,
  previewError = null,
  onApprove,
  onCancel,
}: YeonjangActiveTabInfoAuthorizationPromptProps) {
  if (!action) return null

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="yeonjang-active-tab-info-authorization-title"
      className="space-y-4 rounded-[var(--ui-surface-radius)] border border-amber-200 bg-amber-50 p-5 text-amber-950"
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
          browser.active_tab_info
        </p>
        <h2 id="yeonjang-active-tab-info-authorization-title" className="mt-1 text-lg font-bold">
          활성 탭 확인 승인
        </h2>
        <p className="mt-2 break-words text-sm leading-6 [overflow-wrap:anywhere]">
          이 요청은 브라우저의 현재 활성 탭을 확인하는 민감한 읽기 작업입니다. 승인 전에는 실행하지 않습니다.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--ui-surface-radius)] border border-amber-200 bg-white/70 p-3">
          <dt className="text-xs font-semibold text-amber-800">대상</dt>
          <dd className="mt-1 break-words text-sm font-semibold [overflow-wrap:anywhere]">{action.targetName}</dd>
        </div>
        <div className="rounded-[var(--ui-surface-radius)] border border-amber-200 bg-white/70 p-3">
          <dt className="text-xs font-semibold text-amber-800">필요한 조치</dt>
          <dd className="mt-1 break-words text-sm font-semibold [overflow-wrap:anywhere]">{action.label}</dd>
        </div>
      </dl>

      {onApprove || onCancel ? (
        <div className="flex flex-wrap gap-2">
          {onApprove ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--ui-surface-radius)] bg-stone-950 px-4 text-sm font-semibold text-white shadow-sm"
              onClick={() => onApprove(action, "allow_once")}
            >
              이번 단계 승인
            </button>
          ) : null}
          {onApprove ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--ui-surface-radius)] border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 shadow-sm"
              onClick={() => onApprove(action, "allow_for_session")}
            >
              이 요청 중 승인
            </button>
          ) : null}
          {onCancel ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--ui-surface-radius)] border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 shadow-sm"
              onClick={onCancel}
            >
              취소
            </button>
          ) : null}
        </div>
      ) : null}
      {receipt ? (
        <div role="status" className="rounded-[var(--ui-surface-radius)] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <div className="font-semibold">승인 영수증 생성됨</div>
          <p className="mt-1 break-words [overflow-wrap:anywhere]">
            {receipt.publicTargetName} · {receipt.approvalScope === "allow_once" ? "이번 단계" : "이 요청 중"}
          </p>
        </div>
      ) : null}
      {previewLoading ? (
        <div role="status" className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white/70 p-3 text-sm text-stone-700">
          <div className="font-semibold">실행 전 점검 중</div>
          <p className="mt-1">승인 내용을 실제 실행으로 넘기기 전에 필요한 조건만 확인합니다.</p>
        </div>
      ) : null}
      {previewError ? (
        <div role="status" className="rounded-[var(--ui-surface-radius)] border border-amber-200 bg-white/70 p-3 text-sm text-amber-950">
          <div className="font-semibold">실행 전 점검 실패</div>
          <p className="mt-1 break-words [overflow-wrap:anywhere]">{previewError}</p>
        </div>
      ) : null}
      {preview ? (
        <div role="status" className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white/70 p-3 text-sm text-stone-900">
          <div className="font-semibold">실행 전 점검 결과</div>
          <p className="mt-1 break-words [overflow-wrap:anywhere]">
            {preview.status === "prepared" ? "실행 준비됨" : "실행 전 점검 차단"}
            {" · "}
            {preview.status === "prepared" ? preview.publicTargetName : preview.reasonCode}
          </p>
        </div>
      ) : null}
    </section>
  )
}

export function YeonjangActiveTabInfoDiagnosticsPanel({ view }: YeonjangActiveTabInfoDiagnosticsPanelProps) {
  return (
    <section
      aria-labelledby="yeonjang-active-tab-info-diagnostics-title"
      className="space-y-4 rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white p-5 shadow-sm"
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">advanced diagnostics</p>
        <h2 id="yeonjang-active-tab-info-diagnostics-title" className="mt-1 text-lg font-bold text-stone-950">
          {view.title}
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-stone-600 [overflow-wrap:anywhere]">{view.summary}</p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        {view.targets.map((target) => (
          <article
            key={`${target.targetName}:${target.platformLabel}`}
            className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-stone-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold text-stone-950 [overflow-wrap:anywhere]">
                  {target.targetName}
                </h3>
                <p className="mt-1 text-xs text-stone-500">{target.platformLabel}</p>
              </div>
              <StatusLabel tone="neutral">{target.statusLabel}</StatusLabel>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {target.backendFamilyLabels.length > 0 ? (
                target.backendFamilyLabels.map((label) => (
                  <li key={label}>
                    <StatusLabel tone="info">{label}</StatusLabel>
                  </li>
                ))
              ) : (
                <li className="text-sm text-stone-500">관찰 backend 후보 없음</li>
              )}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

function ReadinessMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-stone-50 px-3 py-2">
      <dt className="text-xs font-semibold text-stone-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-stone-950">{value}</dd>
    </div>
  )
}

function ReadinessGroup({
  title,
  count,
  targets,
}: {
  title: string
  count: number
  targets: YeonjangActiveTabInfoGeneralTargetView[]
}) {
  return (
    <section className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-stone-950">{title}</h3>
        <StatusLabel tone="neutral">{String(count)}</StatusLabel>
      </div>
      {targets.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {targets.map((target) => (
            <ReadinessTargetItem key={`${target.targetName}:${target.userAction}`} target={target} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-stone-500">표시할 연장이 없습니다.</p>
      )}
    </section>
  )
}

function ReadinessTargetItem({ target }: { target: YeonjangActiveTabInfoGeneralTargetView }) {
  return (
    <li className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-stone-950 [overflow-wrap:anywhere]">
            {target.targetName}
          </div>
          <div className="mt-1 text-xs text-stone-500">{target.platformLabel}</div>
        </div>
        <StatusLabel tone={targetTone(target.tone)}>{target.statusLabel}</StatusLabel>
      </div>
      <p className="mt-2 break-words text-sm text-stone-600 [overflow-wrap:anywhere]">{target.reasonLabel}</p>
      <p className="mt-1 break-words text-sm font-semibold text-stone-800 [overflow-wrap:anywhere]">
        {target.actionLabel}
      </p>
    </li>
  )
}

function overallStatusTone(status: YeonjangActiveTabInfoGeneralReadinessView["overallStatus"]): StatusTone {
  switch (status) {
    case "ready":
      return "success"
    case "action_required":
      return "warning"
    case "unavailable":
      return "danger"
  }
}

function overallStatusLabel(status: YeonjangActiveTabInfoGeneralReadinessView["overallStatus"]): string {
  switch (status) {
    case "ready":
      return "준비됨"
    case "action_required":
      return "확인 필요"
    case "unavailable":
      return "사용 불가"
  }
}

function targetTone(tone: YeonjangActiveTabInfoGeneralTargetView["tone"]): StatusTone {
  switch (tone) {
    case "ready":
      return "success"
    case "warning":
      return "warning"
    case "blocked":
      return "danger"
    case "unknown":
      return "neutral"
  }
}
