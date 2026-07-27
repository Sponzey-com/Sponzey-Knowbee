import React, { type ReactNode } from "react"
import type {
  SingleSettingsSectionView,
  SingleSettingsWorkspaceView,
} from "../../lib/unified-settings-workspace"

export interface SingleSettingsWorkspaceShellProps {
  workspace: SingleSettingsWorkspaceView
  onSelectSection: (sectionId: SingleSettingsSectionView["id"]) => void
  children: ReactNode
  emptyMessage?: string
}

export function SingleSettingsWorkspaceShell({
  workspace,
  onSelectSection,
  children,
  emptyMessage,
}: SingleSettingsWorkspaceShellProps) {
  return (
    <section
      aria-label={workspace.title}
      className="grid min-w-0 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]"
      data-testid="single-settings-workspace"
    >
      <nav aria-label={workspace.title} className="min-w-0 border-b border-stone-200 pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {workspace.sections.map((section) => {
            const selected = section.id === workspace.selectedSectionId
            return (
              <button
                key={section.id}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => onSelectSection(section.id)}
                className={[
                  "min-w-0 border px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2",
                  selected
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-800 hover:border-stone-400",
                ].join(" ")}
              >
                <span className="block break-words text-sm font-semibold [overflow-wrap:anywhere]">
                  {section.label}
                </span>
                <span
                  className={[
                    "mt-1 block break-words text-xs [overflow-wrap:anywhere]",
                    selected ? "text-stone-300" : "text-stone-500",
                  ].join(" ")}
                >
                  {section.stateLabel}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="min-w-0">
        {children ?? (
          <div className="border border-dashed border-stone-300 px-5 py-8 text-sm text-stone-500">
            {emptyMessage ?? (workspace.selectedSectionId ? "" : workspace.title)}
          </div>
        )}
      </div>
    </section>
  )
}
