import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { useUiI18n } from "../../lib/ui-i18n"

export type WorkView = "runs" | "schedules"

export function WorkWorkspace({
  activeView,
  children,
}: {
  activeView: WorkView
  children: ReactNode
}) {
  const { text } = useUiI18n()
  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-100" data-testid="work-workspace">
      <header className="shrink-0 border-b border-stone-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-stone-950">{text("작업", "Work")}</h1>
            <p className="mt-1 text-sm text-stone-500">
              {text(
                "진행 중인 실행과 예약 작업을 확인합니다.",
                "Review active runs and schedules.",
              )}
            </p>
          </div>
          <nav
            className="grid min-w-0 grid-cols-2 gap-1 border border-stone-200 bg-stone-50 p-1"
            aria-label={text("작업 보기", "Work views")}
          >
            <WorkTab to="/work/runs" selected={activeView === "runs"}>
              {text("실행", "Runs")}
            </WorkTab>
            <WorkTab to="/work/schedules" selected={activeView === "schedules"}>
              {text("일정", "Schedules")}
            </WorkTab>
          </nav>
        </div>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
    </div>
  )
}

function WorkTab({
  to,
  selected,
  children,
}: {
  to: string
  selected: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      aria-current={selected ? "page" : undefined}
      className={`inline-flex min-h-11 min-w-24 items-center justify-center px-4 py-2 text-sm font-semibold ${
        selected ? "bg-stone-900 text-white" : "bg-white text-stone-700 hover:bg-stone-100"
      }`}
    >
      {children}
    </Link>
  )
}
