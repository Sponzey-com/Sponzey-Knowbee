import * as React from "react"
import type {
  UnifiedSettingsReadinessStatus,
  UnifiedSettingsSectionStatus,
  UnifiedSettingsViewModel,
} from "../../../../core/src/ui/unified-settings.js"

export function UnifiedSettingsSummaryPanel({
  view,
  variant = "full",
}: {
  view: UnifiedSettingsViewModel
  variant?: "full" | "compact"
}) {
  if (variant === "compact") {
    return (
      <section
        className="rounded-lg border border-stone-200 bg-stone-50 p-3"
        data-testid="unified-settings-summary-panel"
        data-variant="compact"
        data-status={view.summary.status}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
              {view.summary.productName}
            </div>
            <h2 className="mt-0.5 truncate text-xs font-semibold text-stone-950">{view.title}</h2>
            <p className="mt-1 text-[11px] leading-4 text-stone-500">
              {view.summary.totalAgentCount} agents · {view.summary.issueCount} issues
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChipClassName(view.summary.status)}`}
            data-testid="unified-settings-summary-status"
          >
            {view.summary.statusLabel}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5" data-testid="unified-settings-section-list">
          {view.sections.map((section) => (
            <div
              key={section.id}
              className="min-w-0 rounded-md border border-stone-100 bg-white px-2 py-1.5"
              data-testid="unified-settings-section"
              data-section-id={section.id}
              data-section-status={section.status}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate text-[11px] font-semibold text-stone-700">{section.title}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${sectionChipClassName(section.status)}`}>
                  {section.itemCount}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section
      className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm"
      data-testid="unified-settings-summary-panel"
      data-status={view.summary.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            {view.summary.productName}
          </div>
          <h2 className="mt-1 text-base font-semibold text-stone-950">{view.title}</h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {view.summary.totalAgentCount} agents · {view.summary.issueCount} issues
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChipClassName(view.summary.status)}`}
            data-testid="unified-settings-summary-status"
          >
            {view.summary.statusLabel}
          </span>
          <button
            type="button"
            disabled={view.summary.primaryAction.disabled}
            className="h-9 rounded-lg border border-stone-900 bg-stone-900 px-3 text-xs font-semibold text-white disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400"
            data-testid="unified-settings-primary-action"
          >
            {view.summary.primaryAction.label}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4" data-testid="unified-settings-section-list">
        {view.sections.map((section) => (
          <div
            key={section.id}
            className="rounded-md border border-stone-100 bg-stone-50 px-3 py-2"
            data-testid="unified-settings-section"
            data-section-id={section.id}
            data-section-status={section.status}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-stone-800">{section.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectionChipClassName(section.status)}`}>
                {section.itemCount}
              </span>
            </div>
          </div>
        ))}
      </div>

      {view.agents.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2" data-testid="unified-settings-agent-list">
          {view.agents.map((agent, index) => (
            <div
              key={`${agent.label}:${index}`}
              className="rounded-md border border-stone-100 bg-white px-3 py-2"
              data-testid="unified-settings-agent-row"
              data-agent-status={agent.status}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-stone-950">{agent.label}</div>
                  <div className="mt-0.5 truncate text-[11px] text-stone-500">{agent.role}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChipClassName(agent.status)}`}>
                  {agent.statusLabel}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-stone-600">{agent.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-stone-400">
                {agent.parentLabel ? <span>{agent.parentLabel}</span> : null}
                <span>{agent.childCount} child</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {view.selectedAgentDetail ? (
        <div
          className="mt-3 rounded-md border border-stone-100 bg-stone-50 p-3"
          data-testid="unified-settings-selected-detail"
        >
          <div className="text-xs font-semibold text-stone-950">{view.selectedAgentDetail.label}</div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {view.selectedAgentDetail.sections.map((section) => (
              <div
                key={section.id}
                className="rounded-md border border-stone-100 bg-white px-3 py-2"
                data-testid="unified-settings-detail-section"
                data-detail-section-id={section.id}
                data-detail-section-status={section.status}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-stone-900">{section.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectionChipClassName(section.status)}`}>
                    {section.itemCount}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-stone-600">{section.summary}</p>
              </div>
            ))}
          </div>
          {view.selectedAgentDetail.monitoring ? (
            <div
              className="mt-3 rounded-md border border-stone-100 bg-white px-3 py-2"
              data-testid="unified-settings-monitoring"
              data-monitoring-state={view.selectedAgentDetail.monitoring.state}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-stone-950">{view.selectedAgentDetail.monitoring.reviewSummary}</div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${monitoringStateClassName(view.selectedAgentDetail.monitoring.state)}`}>
                  {view.selectedAgentDetail.monitoring.statusLabel}
                </span>
              </div>
              <div className="mt-1 text-[11px] leading-5 text-stone-500">
                {view.selectedAgentDetail.monitoring.latestResultSummary}
              </div>
              {view.selectedAgentDetail.monitoring.treePaths.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="unified-settings-monitoring-paths">
                  {view.selectedAgentDetail.monitoring.treePaths.map((path, index) => (
                    <span key={`${path}:${index}`} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                      {path}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 space-y-1.5">
                {view.selectedAgentDetail.monitoring.traceItems.length > 0 ? view.selectedAgentDetail.monitoring.traceItems.slice(-5).map((item, index) => (
                  <div
                    key={`${item.kind}:${index}`}
                    className={`rounded-md border px-2 py-1.5 text-[11px] leading-5 ${monitoringToneClassName(item.tone)}`}
                    data-testid="unified-settings-monitoring-trace-item"
                    data-monitoring-kind={item.kind}
                    data-monitoring-status={item.status}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{item.actorLabel} → {item.targetLabel}</span>
                      <span className="text-current/70">{item.kindLabel}</span>
                    </div>
                    <div className="mt-0.5">{item.summary}</div>
                    {item.redelegationSummary ? <div className="mt-0.5 text-current/80">{item.redelegationSummary}</div> : null}
                    {item.reason ? <div className="mt-0.5 text-current/70">{item.reason}</div> : null}
                    {item.latestResultSummary ? <div className="mt-0.5 text-current/70">{item.latestResultSummary}</div> : null}
                  </div>
                )) : (
                  <div className="rounded-md border border-dashed border-stone-200 px-2 py-2 text-[11px] leading-5 text-stone-500">
                    {view.selectedAgentDetail.monitoring.reviewSummary}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function statusChipClassName(status: UnifiedSettingsReadinessStatus): string {
  if (status === "ready") return "bg-emerald-50 text-emerald-700"
  if (status === "blocked") return "bg-rose-50 text-rose-700"
  if (status === "needs_attention") return "bg-amber-50 text-amber-800"
  return "bg-stone-100 text-stone-600"
}

function sectionChipClassName(status: UnifiedSettingsSectionStatus): string {
  if (status === "ready") return "bg-emerald-50 text-emerald-700"
  if (status === "blocked") return "bg-rose-50 text-rose-700"
  if (status === "needs_attention") return "bg-amber-50 text-amber-800"
  return "bg-stone-100 text-stone-600"
}

function monitoringStateClassName(state: string): string {
  if (state === "loaded") return "bg-emerald-50 text-emerald-700"
  if (state === "stale" || state === "partial") return "bg-amber-50 text-amber-800"
  if (state === "failed") return "bg-rose-50 text-rose-700"
  return "bg-stone-100 text-stone-600"
}

function monitoringToneClassName(tone: string): string {
  if (tone === "success") return "border-emerald-100 bg-emerald-50 text-emerald-800"
  if (tone === "warning") return "border-amber-100 bg-amber-50 text-amber-800"
  if (tone === "error") return "border-rose-100 bg-rose-50 text-rose-800"
  return "border-stone-100 bg-stone-50 text-stone-700"
}
