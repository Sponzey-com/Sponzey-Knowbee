import React from "react"
import type {
  BeginnerSubAgentCreateInput,
  BeginnerSubAgentReadinessPanelView,
} from "../../lib/beginner-sub-agents"
import { type UiLanguage, pickUiText } from "../../stores/uiLanguage"

function toneClass(tone: BeginnerSubAgentReadinessPanelView["tone"]): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-900"
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900"
    case "error":
      return "border-red-200 bg-red-50 text-red-900"
    default:
      return "border-stone-200 bg-white text-stone-900"
  }
}

export function SubAgentReadinessPanel({
  panel,
  language,
  onCreate,
}: {
  panel: BeginnerSubAgentReadinessPanelView
  language: UiLanguage
  onCreate: () => void
}) {
  return (
    <section
      data-sub-agent-readiness-panel={panel.status}
      className={`min-w-0 rounded-[1.75rem] border p-5 shadow-sm [overflow-wrap:anywhere] ${toneClass(panel.tone)}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">
            {pickUiText(language, "팀 설정", "Team setup")}
          </div>
          <h2 className="mt-2 break-words text-xl font-semibold [overflow-wrap:anywhere]">
            {panel.title}
          </h2>
          <p className="mt-2 max-w-3xl break-words text-sm leading-6 opacity-80 [overflow-wrap:anywhere]">
            {panel.summary}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onCreate}
            className="min-w-0 rounded-2xl bg-stone-900 px-4 py-2.5 text-center text-sm font-semibold leading-5 text-white"
          >
            {panel.actions.find((action) => action.id === "create")?.label ??
              pickUiText(language, "추가", "Add")}
          </button>
          {panel.actions
            .filter((action) => action.href)
            .map((action) => (
              <a
                key={action.id}
                href={action.href}
                className="min-w-0 rounded-2xl border border-stone-200 bg-white/70 px-4 py-2.5 text-center text-sm font-semibold leading-5 text-stone-700"
              >
                {action.label}
              </a>
            ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          label={pickUiText(language, "최상위", "Top-level")}
          value={String(panel.stats.topLevelCount)}
        />
        <MiniStat
          label={pickUiText(language, "실행 가능", "Ready")}
          value={String(panel.stats.readyCount)}
        />
        <MiniStat
          label={pickUiText(language, "확인 필요", "Needs attention")}
          value={String(panel.stats.needsAttentionCount)}
        />
        <MiniStat
          label={pickUiText(language, "실행 반영 전", "Pending runtime")}
          value={String(panel.stats.pendingRuntimeCount)}
        />
      </div>

      {panel.cards.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {panel.cards.map((card) => (
            <article
              key={card.id}
              className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 text-stone-900 [overflow-wrap:anywhere]"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                    {card.displayLabel}
                  </div>
                  <div className="mt-1 break-words text-sm leading-6 text-stone-600 [overflow-wrap:anywhere]">
                    {card.role}
                  </div>
                </div>
                <span className="max-w-[45%] shrink-0 break-words rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-right text-xs font-semibold leading-4 text-stone-700 [overflow-wrap:anywhere]">
                  {card.statusLabel}
                </span>
              </div>
              {card.summary.trim() ? (
                <div className="mt-3 break-words text-xs leading-5 text-stone-500 [overflow-wrap:anywhere]">
                  {card.summary}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <div className="mt-4 text-xs leading-5 opacity-70">
        {pickUiText(language, "최근 실행", "Recent runtime")}: {panel.stats.recentRuntimeLabel}
      </div>
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white/75 p-3">
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-stone-900">{value}</div>
    </div>
  )
}

export function BeginnerSubAgentCreateDialog({
  open,
  language,
  value,
  fieldErrors = {},
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  open: boolean
  language: UiLanguage
  value: BeginnerSubAgentCreateInput
  fieldErrors?: Partial<Record<keyof BeginnerSubAgentCreateInput, string>>
  saving: boolean
  onChange: (patch: Partial<BeginnerSubAgentCreateInput>) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-950/40 p-4"
      data-sub-agent-create-dialog="open"
    >
      <section className="max-h-[calc(100vh-2rem)] w-full max-w-2xl min-w-0 overflow-y-auto rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-xl [overflow-wrap:anywhere]">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold text-stone-900 [overflow-wrap:anywhere]">
              {pickUiText(language, "서브 에이전트 추가", "Add sub-agent")}
            </h2>
            <p className="mt-2 break-words text-sm leading-6 text-stone-600 [overflow-wrap:anywhere]">
              {pickUiText(
                language,
                "이름과 맡길 일을 정하면 노우비의 직접 하위 에이전트로 저장됩니다.",
                "Set a name and job. It will be saved as Knowbee's direct child.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-full border border-stone-200 px-3 py-1.5 text-sm font-semibold text-stone-600"
          >
            {pickUiText(language, "닫기", "Close")}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextField
            label={pickUiText(language, "이름", "Name")}
            value={value.displayName}
            error={fieldErrors.displayName}
            onChange={(next) => onChange({ displayName: next })}
          />
          <TextField
            label={pickUiText(language, "별명", "Nickname")}
            value={value.nickname}
            error={fieldErrors.nickname}
            onChange={(next) => onChange({ nickname: next })}
          />
        </div>
        <div className="mt-4 grid gap-4">
          <TextField
            label={pickUiText(language, "하는 일", "Job")}
            value={value.role}
            error={fieldErrors.role}
            onChange={(next) => onChange({ role: next })}
          />
          <label className="grid gap-2 text-sm font-semibold text-stone-700">
            {pickUiText(language, "설명", "Description")}
            <textarea
              value={value.description}
              onChange={(event) => onChange({ description: event.target.value })}
              rows={3}
              className="min-w-0 resize-none rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-700"
          >
            {pickUiText(language, "취소", "Cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? pickUiText(language, "저장 중...", "Saving...")
              : pickUiText(language, "저장", "Save")}
          </button>
        </div>
      </section>
    </div>
  )
}

function TextField({
  label,
  value,
  error,
  onChange,
}: {
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-semibold text-stone-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
      />
      {error ? <span className="text-xs font-semibold text-red-600">{error}</span> : null}
    </label>
  )
}
