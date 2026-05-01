import * as React from "react"
import type { EnterpriseTopology, EnterpriseTopologyValidationIssue } from "../../contracts/enterprise-topology"
import type {
  AgentTeamImportMode,
  AgentTeamTopologyImportPreviewResponse,
  TopologyImportExportFormat,
} from "../../lib/enterprise-topology-operations"
import { useUiI18n } from "../../lib/ui-i18n"
import { topologyIssueTargetId } from "./TopologyValidationAssistant"

export interface TopologyAdvancedImportExportPanelProps {
  topology: EnterpriseTopology | null
  format: TopologyImportExportFormat
  importText: string
  exportText: string
  status?: string
  issues: EnterpriseTopologyValidationIssue[]
  agentTeamPreview: AgentTeamTopologyImportPreviewResponse | null
  teamImportMode: AgentTeamImportMode
  onFormatChange?: (format: TopologyImportExportFormat) => void
  onImportTextChange?: (value: string) => void
  onExportDraft?: () => void
  onImportDraft?: () => void
  onPreviewAgentTeamImport?: () => void
  onApplyAgentTeamImport?: () => void
  onTeamImportModeChange?: (mode: AgentTeamImportMode) => void
}

export function buildTopologyDraftExportText(
  topology: EnterpriseTopology | null,
  format: TopologyImportExportFormat,
): string {
  if (!topology) return ""
  return format === "yaml" ? stringifySimpleYaml(topology) : JSON.stringify(topology, null, 2)
}

export function summarizeImportIssueTargets(
  issues: readonly EnterpriseTopologyValidationIssue[],
): string[] {
  return issues
    .map((issue) => topologyIssueTargetId(issue) ?? issue.path)
    .filter((target, index, targets) => targets.indexOf(target) === index)
}

export function TopologyAdvancedImportExportPanel({
  topology,
  format,
  importText,
  exportText,
  status,
  issues,
  agentTeamPreview,
  teamImportMode,
  onFormatChange,
  onImportTextChange,
  onExportDraft,
  onImportDraft,
  onPreviewAgentTeamImport,
  onApplyAgentTeamImport,
  onTeamImportModeChange,
}: TopologyAdvancedImportExportPanelProps) {
  const { text } = useUiI18n()
  const issueTargets = summarizeImportIssueTargets(issues).slice(0, 6)

  return (
    <details
      className="group border-b border-stone-200 bg-stone-50 px-4 py-3"
      data-testid="topology-advanced-import-export"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm font-semibold text-stone-800">
        <span>{text("고급 가져오기/내보내기", "Advanced import/export")}</span>
        <span className="text-xs font-medium text-stone-500">
          {text("JSON/YAML, Agent/Team 이전", "JSON/YAML, Agent/Team migration")}
        </span>
      </summary>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold text-stone-500">
              <span>{text("형식", "Format")}</span>
              <select
                data-testid="topology-import-export-format"
                value={format}
                onChange={(event) => onFormatChange?.(event.currentTarget.value as TopologyImportExportFormat)}
                className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-800"
              >
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onExportDraft}
              disabled={!topology}
              className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="topology-export-draft"
            >
              {text("초안 내보내기", "Export draft")}
            </button>
            <button
              type="button"
              onClick={onImportDraft}
              disabled={importText.trim().length === 0}
              className="h-9 rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="topology-import-draft"
            >
              {text("초안 가져오기", "Import draft")}
            </button>
            {status ? <span className="pb-2 text-xs font-medium text-stone-500">{status}</span> : null}
          </div>
          <textarea
            data-testid="topology-import-text"
            value={importText}
            onChange={(event) => onImportTextChange?.(event.currentTarget.value)}
            rows={5}
            spellCheck={false}
            placeholder={text("파일에서 붙여넣은 내용만 필요할 때 사용", "Use only when pasted file content is needed")}
            className="min-h-28 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-xs leading-5 text-stone-700 outline-none focus:border-stone-400"
          />
          {exportText ? (
            <pre
              className="max-h-36 overflow-auto rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600"
              data-testid="topology-export-preview"
            >
              {exportText}
            </pre>
          ) : null}
        </section>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold text-stone-500">
              <span>{text("TeamConfig 처리", "TeamConfig handling")}</span>
              <select
                data-testid="topology-team-import-mode"
                value={teamImportMode}
                onChange={(event) => onTeamImportModeChange?.(event.currentTarget.value as AgentTeamImportMode)}
                className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-800"
              >
                <option value="team">{text("Team으로 가져오기", "Import as Team")}</option>
                <option value="skip">{text("건너뛰기", "Skip")}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onPreviewAgentTeamImport}
              className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800"
              data-testid="topology-agent-team-preview"
            >
              {text("Agent/Team 미리보기", "Preview Agent/Team")}
            </button>
            <button
              type="button"
              onClick={onApplyAgentTeamImport}
              disabled={!agentTeamPreview}
              className="h-9 rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="topology-agent-team-apply"
            >
              {text("초안에 적용", "Apply to draft")}
            </button>
          </div>

          {agentTeamPreview ? (
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
              <div className="font-semibold text-stone-800" data-testid="topology-agent-team-preview-summary">
                {agentTeamPreview.metadata.agentCount} Agents · {agentTeamPreview.metadata.teamCount} Teams ·{" "}
                {agentTeamPreview.metadata.relationshipCount} Relations
              </div>
              <div className="mt-1 text-stone-500">
                {agentTeamPreview.metadata.sourceOfTruth} · {agentTeamPreview.metadata.legacySourceRole}
              </div>
              <ul className="mt-2 grid gap-1">
                {agentTeamPreview.transformations.slice(0, 6).map((item) => (
                  <li key={`${item.sourceType}:${item.sourceId}:${item.targetId}`}>
                    {item.summary} · {item.sourceId} → {item.targetId}
                  </li>
                ))}
              </ul>
              {agentTeamPreview.metadata.teamRequiresExplicitChoice ? (
                <div className="mt-2 font-medium text-amber-700">
                  {text("TeamConfig는 OrgUnit으로 자동 변환하지 않습니다.", "TeamConfig is not auto-converted to OrgUnit.")}
                </div>
              ) : null}
            </div>
          ) : null}

          {issueTargets.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="font-semibold">{text("이슈 연결 대상", "Issue targets")}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {issueTargets.map((target) => (
                  <span key={target} className="rounded-full bg-white px-2 py-0.5 font-mono">
                    {target}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </details>
  )
}

function stringifySimpleYaml(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    return value.map((item) => {
      if (item === null || typeof item !== "object") return `${pad}- ${formatYamlScalar(item)}`
      return `${pad}-\n${stringifySimpleYaml(item, indent + 2)}`
    }).join("\n")
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
    if (entries.length === 0) return "{}"
    return entries.map(([key, entryValue]) => {
      if (
        entryValue === null ||
        typeof entryValue !== "object" ||
        (Array.isArray(entryValue) && entryValue.length === 0) ||
        (!Array.isArray(entryValue) && Object.keys(entryValue as Record<string, unknown>).length === 0)
      ) {
        return `${pad}${key}: ${formatYamlScalar(entryValue)}`
      }
      return `${pad}${key}:\n${stringifySimpleYaml(entryValue, indent + 2)}`
    }).join("\n")
  }
  return `${pad}${formatYamlScalar(value)}`
}

function formatYamlScalar(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "[]" : stringifySimpleYaml(value)
  if (value && typeof value === "object") {
    return Object.keys(value).length === 0 ? "{}" : stringifySimpleYaml(value)
  }
  if (value === null || value === undefined) return "null"
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  const text = String(value)
  if (/^[A-Za-z0-9_./:@-]+$/.test(text) && !["true", "false", "null"].includes(text)) return text
  return JSON.stringify(text)
}
