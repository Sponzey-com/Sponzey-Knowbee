import React from "react"
import type { MemoryInspectorSnapshot } from "../../api/client"
import type { ResourceReadState } from "../../lib/resource-read-state"
import { useUiI18n } from "../../lib/ui-i18n"
import { ResourceReadStatusNotice } from "../ResourceReadStatusNotice"
import { Skeleton } from "../ui/Skeleton"

function statusLabel(text: (ko: string, en: string) => string, status: "ok" | "warning"): string {
  return status === "warning" ? text("주의", "Warning") : text("정상", "Ready")
}

function ownerName(
  text: (ko: string, en: string) => string,
  owner: MemoryInspectorSnapshot["ownerCards"][number],
): string {
  const name = owner.agentNameSnapshot?.trim()
  if (name) return name
  return owner.ownerType === "main_agent"
    ? text("메인 에이전트", "Main agent")
    : text("이름 없는 서브 에이전트", "Unnamed sub-agent")
}

export function MemorySettingsOverviewPanel({
  readState,
  onRefresh,
}: {
  readState: ResourceReadState<MemoryInspectorSnapshot>
  onRefresh: () => void
}) {
  const { text, displayText } = useUiI18n()
  const snapshot = readState.data
  const cards = snapshot?.ownerCards ?? []

  return (
    <section className="space-y-4" aria-labelledby="memory-settings-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="memory-settings-title" className="text-2xl font-semibold text-stone-950">
            {text("메모리 상태", "Memory status")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            {text(
              "각 에이전트의 독립 메모리와 압축 상태를 확인합니다. 메모리 정책은 서브 에이전트 설정에서 해당 에이전트를 선택해 변경합니다.",
              "Review isolated memory and compaction status for each agent. Change an agent's memory policy from that agent's settings.",
            )}
          </p>
        </div>
        {readState.status === "ready" ? (
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-11 shrink-0 border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
          >
            {text("새로고침", "Refresh")}
          </button>
        ) : null}
      </div>

      {readState.status === "failed" ||
      readState.status === "stale" ||
      (readState.status === "loading" && readState.data !== null) ? (
        <ResourceReadStatusNotice
          state={readState}
          subject="settings"
          text={text}
          onRefresh={onRefresh}
        />
      ) : null}

      {readState.status === "loading" && readState.data === null ? (
        <div
          className="grid gap-3 sm:grid-cols-2"
          aria-label={text("메모리 상태 불러오는 중", "Loading memory status")}
        >
          <Skeleton
            width="100%"
            height="88px"
            label={text("메모리 상태 불러오는 중", "Loading memory status")}
          />
          <Skeleton
            width="100%"
            height="88px"
            label={text("메모리 상태 불러오는 중", "Loading memory status")}
          />
        </div>
      ) : null}

      {snapshot ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [text("메모리 대상", "Memory owners"), snapshot.summary.owners],
            [text("주의 필요", "Warnings"), snapshot.summary.warningOwners],
            [text("불러온 기록", "Recall events"), snapshot.summary.recallEvents],
            [text("압축 실행", "Compaction runs"), snapshot.summary.compactionRuns],
          ].map(([label, value]) => (
            <div key={String(label)} className="border border-stone-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold text-stone-500">{label}</div>
              <div className="mt-2 text-xl font-semibold text-stone-950">{value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {cards.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <article
              key={card.ownerScopeKey}
              className="min-w-0 border border-stone-200 bg-white px-4 py-3"
            >
              <div className="flex min-w-0 items-center justify-between gap-3">
                <h3 className="min-w-0 break-words text-sm font-semibold text-stone-950">
                  {displayText(ownerName(text, card))}
                </h3>
                <span
                  className={
                    card.driftWarningState === "warning"
                      ? "text-xs font-semibold text-amber-700"
                      : "text-xs font-semibold text-emerald-700"
                  }
                >
                  {statusLabel(text, card.driftWarningState)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-600">
                <span>
                  {text("최근 대화", "Recent context")} {card.currentRawTokenEstimate}
                </span>
                <span>
                  {text("불러옴", "Recall")} {card.recallHitCount}
                </span>
                <span>
                  {text("보존 대기", "Pending")} {card.pendingPreservationCount}
                </span>
                <span>
                  {text("압축 깊이", "Compaction depth")} {card.activeCapsuleChainDepth}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : readState.status === "ready" ? (
        <div className="border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-600">
          {text("표시할 메모리 상태가 없습니다.", "No memory status is available.")}
        </div>
      ) : null}
    </section>
  )
}
