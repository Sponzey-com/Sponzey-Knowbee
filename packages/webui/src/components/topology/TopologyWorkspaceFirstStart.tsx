import * as React from "react"
import type { TopologyWorkspaceStarterTemplate, TopologyWorkspaceStarterTemplateId } from "../../lib/topology-workspace-templates"
import { TOPOLOGY_WORKSPACE_FIRST_START_COPY } from "../../lib/topology-workspace-copy"
import { useUiI18n } from "../../lib/ui-i18n"

export interface TopologyWorkspaceFirstStartPanelProps {
  templates: TopologyWorkspaceStarterTemplate[]
  onSelectTemplate?: (templateId: TopologyWorkspaceStarterTemplateId) => void
  onAddFirstStep?: () => void
}

export function TopologyWorkspaceFirstStartPanel({
  templates,
  onSelectTemplate,
  onAddFirstStep,
}: TopologyWorkspaceFirstStartPanelProps) {
  const { text } = useUiI18n()
  return (
    <section
      className="border-b border-stone-200 bg-white px-4 py-2.5"
      data-testid="topology-workspace-first-start"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">
            {text(TOPOLOGY_WORKSPACE_FIRST_START_COPY.templateSectionKo, TOPOLOGY_WORKSPACE_FIRST_START_COPY.templateSectionEn)}
          </div>
          <h2 className="mt-0.5 text-base font-semibold text-stone-950">
            {text(TOPOLOGY_WORKSPACE_FIRST_START_COPY.titleKo, TOPOLOGY_WORKSPACE_FIRST_START_COPY.titleEn)}
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs leading-5 text-stone-600">
            {text(TOPOLOGY_WORKSPACE_FIRST_START_COPY.descriptionKo, TOPOLOGY_WORKSPACE_FIRST_START_COPY.descriptionEn)}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddFirstStep}
          className="h-8 rounded-md bg-stone-900 px-3 text-xs font-semibold text-white"
          data-testid="topology-workspace-add-first-step"
        >
          {text(TOPOLOGY_WORKSPACE_FIRST_START_COPY.primaryActionKo, TOPOLOGY_WORKSPACE_FIRST_START_COPY.primaryActionEn)}
        </button>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelectTemplate?.(template.id)}
            className="min-h-[76px] rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-left hover:border-sky-200 hover:bg-sky-50"
            data-testid={`topology-workspace-template-${template.id}`}
          >
            <span className="text-xs font-semibold text-stone-950">
              {text(template.labelKo, template.labelEn)}
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-stone-600">
              {text(template.descriptionKo, template.descriptionEn)}
            </span>
            <span className="mt-1.5 inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-600">
              {text(template.primaryActionKo, template.primaryActionEn)}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
