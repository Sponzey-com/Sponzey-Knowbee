import { Suspense, lazy, useEffect } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { EmptyState } from "../components/EmptyState"
import { ResourceReadStatusNotice } from "../components/ResourceReadStatusNotice"
import { RunStatusCard } from "../components/runs/RunStatusCard"
import { RunStepTimeline } from "../components/runs/RunStepTimeline"
import { RunSummaryPanel } from "../components/runs/RunSummaryPanel"
import { buildTaskMonitorCards } from "../lib/task-monitor"
import { useUiI18n } from "../lib/ui-i18n"
import { useRunsStore } from "../stores/runs"

const RunsDiagnosticPage = lazy(() =>
  import("./RunsDiagnosticPage").then((module) => ({ default: module.RunsDiagnosticPage })),
)

export function RunsPage() {
  const { text } = useUiI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const diagnosticMode = searchParams.get("mode") === "diagnostic"
  const {
    initialized,
    loading,
    runs,
    executionOutcomes,
    tasks,
    operationsSummary,
    readState,
    selectedRunId,
    ensureInitialized,
    refresh,
    selectRun,
    cancelRun,
  } = useRunsStore()

  useEffect(() => {
    void ensureInitialized()
  }, [ensureInitialized])

  if (diagnosticMode) {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-stone-100 text-sm text-stone-500">
            {text("진단 화면을 불러오는 중입니다.", "Loading diagnostics.")}
          </div>
        }
      >
        <RunsDiagnosticPage onExit={() => setSearchParams({}, { replace: true })} />
      </Suspense>
    )
  }

  const cards = buildTaskMonitorCards(tasks, runs, text)
  const selectedCard =
    cards.find((card) => card.key === selectedRunId || card.representative.id === selectedRunId) ??
    cards[0] ??
    null
  const selectedRun = selectedCard?.representative ?? null
  const activeCount = cards.filter((card) => card.representative.canCancel).length

  return (
    <div className="flex h-full min-w-0 flex-col bg-stone-100 lg:flex-row lg:overflow-hidden">
      <aside className="flex h-[30rem] w-full shrink-0 flex-col border-b border-stone-200 bg-white lg:h-full lg:w-[25rem] lg:border-b-0 lg:border-r">
        <header className="border-b border-stone-200 px-5 py-5">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-stone-950">
                {text("작업 실행", "Work runs")}
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                {text(
                  `진행 중 ${activeCount}개 · 최근 ${cards.length}개`,
                  `${activeCount} active · ${cards.length} recent`,
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <Link
                to="/work/schedules"
                className="inline-flex min-h-11 items-center rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
              >
                {text("일정", "Schedules")}
              </Link>
              <button
                type="button"
                onClick={() => setSearchParams({ mode: "diagnostic" })}
                className="min-h-11 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
              >
                {text("진단", "Diagnostics")}
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {readState.status === "failed" ||
          readState.status === "stale" ||
          (readState.status === "loading" && readState.data !== null) ? (
            <div className="mb-4">
              <ResourceReadStatusNotice
                state={readState}
                subject="work"
                text={text}
                onRefresh={() => void refresh()}
              />
            </div>
          ) : null}
          {readState.status === "failed" ? null : !initialized || loading ? (
            <output className="space-y-3" aria-label={text("실행 목록 로딩", "Loading runs")}>
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-32 animate-pulse rounded-lg bg-stone-100 motion-reduce:animate-none"
                />
              ))}
            </output>
          ) : cards.length > 0 ? (
            <div className="space-y-3">
              {cards.map((card) => (
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
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={text("표시할 실행이 없습니다", "No runs to display")}
              description={text(
                "대화에서 요청을 실행하면 이곳에 표시됩니다.",
                "Runs created from chat appear here.",
              )}
            />
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {selectedRun ? (
          <div className="mx-auto max-w-4xl space-y-5">
            <RunSummaryPanel run={selectedRun} diagnosticMode={false} />
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-stone-900">
                {text("진행 단계", "Progress steps")}
              </h3>
              <div className="mt-4">
                <RunStepTimeline steps={selectedRun.steps} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryMetric
                label={text("실행 횟수", "Attempts")}
                value={String(selectedCard?.attempts.length ?? 0)}
              />
              <SummaryMetric
                label={text("현재 상태", "Current status")}
                value={selectedRun.status}
              />
              <SummaryMetric
                label={text("오래된 대기", "Old waits")}
                value={String(operationsSummary?.stale.total ?? 0)}
              />
            </div>
          </div>
        ) : readState.status === "failed" ? null : (
          <div className="mx-auto max-w-3xl">
            <EmptyState
              title={text("선택된 실행이 없습니다", "No run selected")}
              description={text(
                "왼쪽 목록에서 확인할 실행을 선택하세요.",
                "Select a run from the list.",
              )}
            />
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-stone-900">{value}</div>
    </div>
  )
}
