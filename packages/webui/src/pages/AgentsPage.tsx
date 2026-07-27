import React, { useDeferredValue, useEffect, useRef, useState } from "react"
import { api } from "../api/client"
import { AgentOperationalSettingsEditor } from "../components/AgentOperationalSettingsEditor"
import { ResourceReadStatusNotice } from "../components/ResourceReadStatusNotice"
import { UserRecoveryNotice } from "../components/UserRecoveryNotice"
import { Button } from "../components/ui/Button"
import { Drawer } from "../components/ui/Drawer"
import { InlineNotice } from "../components/ui/InlineNotice"
import { Skeleton } from "../components/ui/Skeleton"
import { StatusLabel } from "../components/ui/StatusLabel"
import type {
  AgentCapabilityBindingProjection,
  AgentCapabilityKind,
  AgentOperationalSettingsProjection,
  AgentRelationshipProjection,
  AgentWorkspaceDetail,
  AgentWorkspaceItem,
  AgentWorkspacePageResponse,
  AgentWorkspaceStatus,
} from "../contracts/agents"
import {
  type AgentOperationalSettingsDraft,
  type AgentOperationalSettingsSection,
  buildOperationalSettingsMutationRequest,
  createAgentOperationalSettingsDraft,
  operationalSettingsErrorMessage,
  validateOperationalSettingsDraft,
} from "../lib/agent-operational-settings-draft"
import { agentParentCandidates } from "../lib/agent-relationship-viewmodel"
import { confirmCreatedAgentVisible } from "../lib/agent-save-visibility"
import {
  type AgentBindingMutationState,
  initialAgentBindingMutation,
  projectAgentFailure,
  projectAgentReceiptFailure,
  reduceAgentBindingMutation,
} from "../lib/agent-workspace-recovery"
import {
  type ResourceReadState,
  initialResourceReadState,
  reduceResourceReadState,
} from "../lib/resource-read-state"
import { useUiI18n } from "../lib/ui-i18n"
import { type UserRecoveryProjection, projectUserRecovery } from "../lib/user-recovery"

type StatusFilter = AgentWorkspaceStatus | ""
type AgentDetailSection = "basic" | "ai" | "capabilities" | "memory" | "permissions" | "delegation"

const LazyAgentRelationshipCanvas = React.lazy(() =>
  import("../components/AgentRelationshipCanvas").then((module) => ({
    default: module.AgentRelationshipCanvas,
  })),
)

export interface AgentsViewProps {
  page: AgentWorkspacePageResponse | null
  selected: AgentWorkspaceDetail | null
  loading: boolean
  readState?: ResourceReadState<AgentWorkspacePageResponse>
  error?: string | null
  search: string
  status: StatusFilter
  onSearch(value: string): void
  onStatus(value: StatusFilter): void
  onRefresh(): void
  onSelect(ref: string, trigger?: HTMLElement): void
  onClose(): void
  drawerMode?: "create" | "detail"
  draftName?: string
  draftRole?: string
  saving?: boolean
  mutationError?: UserRecoveryProjection | null
  archiveConfirmed?: boolean
  activeSection?: AgentDetailSection
  capabilityProjection?: AgentCapabilityBindingProjection | null
  capabilityDraft?: Readonly<Record<string, boolean>>
  capabilityLoading?: boolean
  capabilitySearch?: string
  capabilityKind?: AgentCapabilityKind | ""
  capabilityError?: UserRecoveryProjection | null
  capabilityMutation?: AgentBindingMutationState
  relationshipProjection?: AgentRelationshipProjection | null
  relationshipLoading?: boolean
  relationshipError?: UserRecoveryProjection | null
  savedAgent?: { agentRef: string; name: string } | null
  relationshipParentDraft?: string | null
  settingsProjection?: AgentOperationalSettingsProjection | null
  settingsDraft?: AgentOperationalSettingsDraft | null
  settingsLoading?: boolean
  settingsError?: string | null
  settingsElevationConfirmed?: boolean
  onAdd?(trigger: HTMLElement): void
  onDraftName?(value: string): void
  onDraftRole?(value: string): void
  onSave?(): void
  onArchiveConfirmed?(value: boolean): void
  onArchive?(): void
  onSection?(section: AgentDetailSection): void
  onCapabilitySearch?(value: string): void
  onCapabilityKind?(value: AgentCapabilityKind | ""): void
  onCapabilityToggle?(capabilityRef: string, bound: boolean): void
  onCapabilitySave?(): void
  onCapabilityRecover?(): void
  onRelationshipParentDraft?(parentRef: string | null): void
  onRelationshipSave?(): void
  onRelationshipRecover?(): void
  onMutationRecover?(): void
  onSettingsDraft?(draft: AgentOperationalSettingsDraft): void
  onSettingsElevationConfirmed?(confirmed: boolean): void
  onSettingsSave?(section: AgentOperationalSettingsSection): void
}

function capabilityKindLabel(kind: AgentCapabilityKind, text: (ko: string, en: string) => string) {
  if (kind === "skill") return text("스킬", "Skill")
  if (kind === "mcp_server") return "MCP"
  return text("연장", "Yeonjang")
}

function capabilityPurpose(kind: AgentCapabilityKind, bound: boolean): string {
  const prefix = kind === "mcp_server" ? "mcp" : kind
  return `${prefix}_${bound ? "bind" : "unbind"}`
}

export function AgentsView(props: AgentsViewProps) {
  const { text } = useUiI18n()
  const returnFocusRef = useRef<HTMLElement>(null)
  const mutationNoticeRef = useRef<HTMLDivElement>(null)
  const savedAgentRef = useRef<HTMLButtonElement>(null)
  const operationalSection =
    props.activeSection === "ai" ||
    props.activeSection === "memory" ||
    props.activeSection === "permissions"
  const [advancedOpen, setAdvancedOpen] = useState(operationalSection)
  useEffect(() => {
    if (props.mutationError) mutationNoticeRef.current?.focus()
  }, [props.mutationError])
  useEffect(() => {
    if (operationalSection) setAdvancedOpen(true)
  }, [operationalSection])
  useEffect(() => {
    if (!props.savedAgent) return
    savedAgentRef.current?.focus()
    savedAgentRef.current?.scrollIntoView({ block: "center", behavior: "auto" })
  }, [props.savedAgent])
  const readState =
    props.readState ??
    (props.error
      ? reduceResourceReadState(initialResourceReadState<AgentWorkspacePageResponse>(), {
          type: "load_failed",
          failure: projectUserRecovery(props.error, "read"),
        })
      : props.page
        ? reduceResourceReadState(initialResourceReadState<AgentWorkspacePageResponse>(), {
            type: "load_succeeded",
            data: props.page,
            observedAt: props.page.observedAt,
          })
        : initialResourceReadState<AgentWorkspacePageResponse>())
  const selectedSettingsPanel = props.selected ? (
    <div className="grid gap-5">
      <div>
        <StatusLabel tone={props.selected.status === "enabled" ? "success" : "neutral"}>
          {props.selected.status}
        </StatusLabel>
        <p className="mt-3 text-sm text-stone-600">{props.selected.role}</p>
      </div>
      <div className="grid gap-3">
        <nav className="grid grid-cols-3 gap-2" aria-label={text("주요 설정", "Primary settings")}>
          {[
            ["basic", text("기본", "Basic")],
            ["capabilities", text("기능", "Capabilities")],
            ["delegation", text("위임", "Delegation")],
          ].map(([section, label]) => (
            <button
              key={section}
              type="button"
              aria-pressed={(props.activeSection ?? "basic") === section}
              disabled={props.saving}
              onClick={() => props.onSection?.(section as AgentDetailSection)}
              className={`min-h-11 rounded-[var(--ui-surface-radius)] border px-3 text-sm font-semibold ${
                (props.activeSection ?? "basic") === section
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-700"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <details
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-stone-50"
        >
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-stone-800">
            {text("고급 설정", "Advanced settings")}
          </summary>
          <nav
            className="grid grid-cols-3 gap-2 border-t border-stone-200 p-3"
            aria-label={text("고급 설정", "Advanced settings")}
          >
            {[
              ["ai", "AI"],
              ["memory", text("메모리", "Memory")],
              ["permissions", text("권한", "Permissions")],
            ].map(([section, label]) => (
              <button
                key={section}
                type="button"
                aria-pressed={(props.activeSection ?? "basic") === section}
                disabled={props.saving}
                onClick={() => props.onSection?.(section as AgentDetailSection)}
                className={`min-h-11 rounded-[var(--ui-surface-radius)] border px-3 text-sm font-semibold ${
                  (props.activeSection ?? "basic") === section
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-700"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </details>
      </div>
      {(props.activeSection ?? "basic") === "basic" ? (
        <div className="grid gap-3 border-b border-stone-200 pb-5">
          <label className="grid gap-1 text-sm font-medium">
            <span>{text("이름", "Name")}</span>
            <input
              aria-label={text("에이전트 이름", "Agent name")}
              value={props.draftName ?? props.selected.name}
              disabled={props.saving}
              onChange={(event) => props.onDraftName?.(event.target.value)}
              className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            <span>{text("역할", "Role")}</span>
            <textarea
              aria-label={text("에이전트 역할", "Agent role")}
              value={props.draftRole ?? props.selected.role}
              disabled={props.saving}
              onChange={(event) => props.onDraftRole?.(event.target.value)}
              rows={3}
              className="rounded-[var(--ui-surface-radius)] border border-stone-300 px-3 py-2"
            />
          </label>
          {props.mutationError ? (
            <div ref={mutationNoticeRef} tabIndex={-1} className="outline-none">
              <UserRecoveryNotice
                projection={props.mutationError}
                subject="agents"
                text={text}
                onAction={
                  props.mutationError.action === "refresh_state"
                    ? props.onMutationRecover
                    : undefined
                }
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="primary" pending={props.saving} onClick={props.onSave}>
              {text("저장", "Save")}
            </Button>
          </div>
        </div>
      ) : null}
      {(props.activeSection ?? "basic") === "basic" ? (
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-stone-500">{text("상위", "Parent")}</dt>
            <dd className="font-medium">{props.selected.parentName}</dd>
          </div>
          <div>
            <dt className="text-stone-500">{text("연결된 기능", "Connected capabilities")}</dt>
            <dd className="font-medium">
              {[
                ...props.selected.bindingNames.skills,
                ...props.selected.bindingNames.mcpServers,
                ...props.selected.bindingNames.yeonjang,
              ].join(", ") || text("없음", "None")}
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">{text("하위 에이전트", "Child agents")}</dt>
            <dd className="font-medium">
              {props.selected.directChildNames.join(", ") || text("없음", "None")}
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">{text("연결", "Bindings")}</dt>
            <dd className="font-medium">
              Skills {props.selected.bindingCounts.skills} · MCP{" "}
              {props.selected.bindingCounts.mcpServers} · {text("연장", "Yeonjang")}{" "}
              {props.selected.bindingCounts.yeonjang}
            </dd>
          </div>
        </dl>
      ) : null}
      {(props.activeSection ?? "basic") === "capabilities" ? (
        <section
          className="grid min-w-0 gap-4 overflow-hidden"
          aria-label={text("기능 연결", "Capability bindings")}
        >
          <div className="grid gap-2">
            <input
              aria-label={text("기능 검색", "Search capabilities")}
              value={props.capabilitySearch ?? ""}
              disabled={props.saving}
              onChange={(event) => props.onCapabilitySearch?.(event.target.value)}
              placeholder={text("이름 검색", "Search by name")}
              className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 px-3"
            />
            <select
              aria-label={text("기능 종류", "Capability kind")}
              value={props.capabilityKind ?? ""}
              disabled={props.saving}
              onChange={(event) =>
                props.onCapabilityKind?.(event.target.value as AgentCapabilityKind | "")
              }
              className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 px-3"
            >
              <option value="">{text("전체", "All")}</option>
              <option value="skill">{text("스킬", "Skills")}</option>
              <option value="mcp_server">MCP</option>
              <option value="yeonjang">{text("연장", "Yeonjang")}</option>
            </select>
          </div>
          {props.capabilityError ? (
            <UserRecoveryNotice
              projection={props.capabilityError}
              subject="agents"
              text={text}
              onAction={
                props.capabilityError.action === "refresh_state"
                  ? props.onCapabilityRecover
                  : undefined
              }
            />
          ) : null}
          {props.capabilityMutation?.state === "failed" ? (
            <InlineNotice
              tone="warning"
              title={text("일부 연결을 확인해야 합니다", "Some bindings need review")}
            >
              {text(
                `${props.capabilityMutation.appliedCount}개 적용, ${props.capabilityMutation.rejectedCount}개 미적용`,
                `${props.capabilityMutation.appliedCount} applied, ${props.capabilityMutation.rejectedCount} not applied`,
              )}
            </InlineNotice>
          ) : null}
          {props.capabilityProjection?.orphanReasonCodes.length ? (
            <InlineNotice tone="warning" title={text("연결 확인 필요", "Binding needs review")}>
              {text(
                "대상이 없는 연결이 있어 편집할 수 없습니다.",
                "An orphaned binding cannot be edited.",
              )}
            </InlineNotice>
          ) : null}
          {props.capabilityLoading && !props.capabilityProjection ? (
            <Skeleton
              width="100%"
              height="120px"
              label={text("기능 불러오는 중", "Loading capabilities")}
            />
          ) : null}
          {!props.capabilityLoading && props.capabilityProjection?.items.length === 0 ? (
            <InlineNotice tone="info" title={text("등록된 기능이 없습니다", "No capabilities")}>
              {text(
                "공통 목록에 등록된 스킬, MCP 또는 연장이 없습니다.",
                "No Skill, MCP, or Yeonjang entries are registered.",
              )}
            </InlineNotice>
          ) : null}
          <div className="grid gap-2">
            {props.capabilityProjection?.items
              .filter((item) => {
                const searchValue = (props.capabilitySearch ?? "").trim().toLocaleLowerCase()
                return (
                  (!(props.capabilityKind ?? "") || item.kind === props.capabilityKind) &&
                  (!searchValue || item.displayName.toLocaleLowerCase().includes(searchValue))
                )
              })
              .map((item) => {
                const checked = props.capabilityDraft?.[item.capabilityRef] ?? item.bound
                const changed = checked !== item.bound
                return (
                  <label
                    key={item.capabilityRef}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--ui-surface-radius)] border border-stone-200 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">{item.displayName}</strong>
                      <span className="mt-1 flex flex-wrap gap-2 text-xs text-stone-500">
                        <span>{capabilityKindLabel(item.kind, text)}</span>
                        <span>{item.runtimeStatus}</span>
                        {changed ? (
                          <span className="font-semibold text-amber-700">
                            {text("변경", "Changed")}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      aria-label={`${item.displayName} ${text("연결", "binding")}`}
                      checked={checked}
                      disabled={!item.editable || props.saving}
                      onChange={(event) =>
                        props.onCapabilityToggle?.(item.capabilityRef, event.target.checked)
                      }
                      className="h-5 w-5 shrink-0"
                    />
                  </label>
                )
              })}
          </div>
          <div className="sticky bottom-0 flex min-w-0 items-center justify-between gap-3 border-t border-stone-200 bg-white py-3">
            <span className="text-sm text-stone-600">
              {text("변경", "Changes")}{" "}
              {props.capabilityProjection?.items.filter(
                (item) =>
                  (props.capabilityDraft?.[item.capabilityRef] ?? item.bound) !== item.bound,
              ).length ?? 0}
            </span>
            <Button
              variant="primary"
              className="shrink-0"
              pending={props.saving}
              disabled={
                props.capabilityMutation?.requiresRefresh === true ||
                !props.capabilityProjection?.items.some(
                  (item) =>
                    (props.capabilityDraft?.[item.capabilityRef] ?? item.bound) !== item.bound,
                )
              }
              onClick={props.onCapabilitySave}
            >
              {text("기능 저장", "Save capabilities")}
            </Button>
          </div>
        </section>
      ) : null}
      {operationalSection ? (
        <section
          className="grid min-w-0 gap-4"
          aria-label={text("에이전트 운영 설정", "Agent operational settings")}
        >
          {props.settingsError ? (
            <InlineNotice
              tone="danger"
              title={text("설정을 불러오지 못했습니다", "Could not load settings")}
            >
              {props.settingsError}
            </InlineNotice>
          ) : null}
          {props.settingsLoading && !props.settingsProjection ? (
            <Skeleton
              width="100%"
              height="160px"
              label={text("설정 불러오는 중", "Loading settings")}
            />
          ) : null}
          {props.settingsProjection?.diagnosticCodes.length ? (
            <InlineNotice tone="warning" title={text("설정 확인 필요", "Settings need review")}>
              {props.settingsProjection.diagnosticCodes.join(", ")}
            </InlineNotice>
          ) : null}
          {props.activeSection &&
          operationalSection &&
          props.settingsProjection &&
          props.settingsDraft ? (
            <AgentOperationalSettingsEditor
              section={props.activeSection as AgentOperationalSettingsSection}
              projection={props.settingsProjection}
              draft={props.settingsDraft}
              saving={Boolean(props.saving)}
              elevationConfirmed={Boolean(props.settingsElevationConfirmed)}
              onDraft={(draft) => props.onSettingsDraft?.(draft)}
              onElevationConfirmed={(confirmed) => props.onSettingsElevationConfirmed?.(confirmed)}
              onSave={() =>
                props.onSettingsSave?.(props.activeSection as AgentOperationalSettingsSection)
              }
              text={text}
            />
          ) : null}
        </section>
      ) : null}
      {(props.activeSection ?? "basic") === "delegation" ? (
        <section
          className="grid min-w-0 gap-4"
          aria-label={text("위임 설정", "Delegation settings")}
        >
          {props.relationshipError ? (
            <UserRecoveryNotice
              projection={props.relationshipError}
              subject="agents"
              text={text}
              onAction={
                props.relationshipError.action === "refresh_state"
                  ? props.onRelationshipRecover
                  : undefined
              }
            />
          ) : null}
          {props.relationshipLoading && !props.relationshipProjection ? (
            <Skeleton
              width="100%"
              height="120px"
              label={text("위임 불러오는 중", "Loading delegation")}
            />
          ) : null}
          {props.relationshipProjection ? (
            <>
              <label className="grid gap-1 text-sm font-medium">
                <span>{text("상위 에이전트", "Parent agent")}</span>
                <select
                  aria-label={text("상위 에이전트", "Parent agent")}
                  value={props.relationshipParentDraft ?? ""}
                  disabled={props.saving}
                  onChange={(event) =>
                    props.onRelationshipParentDraft?.(event.target.value || null)
                  }
                  className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3"
                >
                  <option value="">{text("연결 없음", "No parent")}</option>
                  <option value={props.relationshipProjection.root.agentRef}>
                    {props.relationshipProjection.root.name} {text("직속", "direct")}
                  </option>
                  {agentParentCandidates({
                    selectedRef: props.selected.agentRef,
                    agents: props.page?.items ?? [],
                    projection: props.relationshipProjection,
                  }).map((agent) => (
                    <option key={agent.agentRef} value={agent.agentRef}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm leading-6 text-stone-600">
                {text(
                  "자기 자신과 하위 에이전트는 상위 후보에서 제외됩니다.",
                  "The selected agent and its descendants cannot be parents.",
                )}
              </p>
              <div className="flex justify-end">
                <Button variant="primary" pending={props.saving} onClick={props.onRelationshipSave}>
                  {text("위임 저장", "Save delegation")}
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
      {(props.activeSection ?? "basic") === "basic" && props.selected.status !== "archived" ? (
        <section className="border-t border-stone-200 pt-5">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={props.archiveConfirmed ?? false}
              disabled={props.saving}
              onChange={(event) => props.onArchiveConfirmed?.(event.target.checked)}
            />
            {text(
              `하위 ${props.selected.directChildCount}개와 연결 ${Object.values(props.selected.bindingCounts).reduce((sum, count) => sum + count, 0)}개의 영향을 확인했습니다.`,
              `I reviewed the impact on ${props.selected.directChildCount} children and ${Object.values(props.selected.bindingCounts).reduce((sum, count) => sum + count, 0)} bindings.`,
            )}
          </label>
          <Button
            variant="danger"
            className="mt-2 w-full"
            disabled={!props.archiveConfirmed || props.saving}
            pending={props.saving}
            onClick={props.onArchive}
          >
            {text("에이전트 보관", "Archive agent")}
          </Button>
        </section>
      ) : null}
    </div>
  ) : (
    <div className="flex min-h-[24rem] items-center justify-center rounded-[var(--ui-surface-radius)] border border-dashed border-stone-300 bg-stone-50 px-4 text-center text-sm leading-6 text-stone-500">
      {text(
        "에이전트를 선택하면 여기에서 설정을 바로 편집할 수 있습니다.",
        "Select an agent to edit its settings here.",
      )}
    </div>
  )
  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-5 py-5 sm:px-8">
        <div className="flex w-full items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">
              {text("에이전트", "Agents")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-stone-950">
              {text("서브 에이전트", "Sub-agents")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {text("역할과 연결된 기능을 확인합니다.", "Review roles and connected capabilities.")}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="primary"
              className="!min-h-11"
              onClick={(event) => {
                returnFocusRef.current = event.currentTarget
                props.onAdd?.(event.currentTarget)
              }}
            >
              {text("에이전트 추가", "Add agent")}
            </Button>
            <Button className="!min-h-11" onClick={props.onRefresh} pending={props.loading}>
              {text("새로고침", "Refresh")}
            </Button>
          </div>
        </div>
      </header>
      <div className="w-full px-5 py-6 sm:px-8">
        {props.savedAgent ? (
          <InlineNotice
            tone="success"
            title={text(
              `${props.savedAgent.name} 에이전트를 저장했습니다`,
              `${props.savedAgent.name} was saved`,
            )}
          >
            {text(
              "아래 에이전트 구성과 목록에 바로 반영되었습니다.",
              "The agent now appears in the configuration and list below.",
            )}
          </InlineNotice>
        ) : null}
        <section
          className={`${props.savedAgent ? "mt-5 " : ""}grid grid-cols-2 gap-px overflow-hidden rounded-[var(--ui-surface-radius)] border border-stone-200 bg-stone-200 sm:grid-cols-4`}
          aria-label={text("에이전트 요약", "Agent summary")}
        >
          {[
            [text("전체", "Total"), props.page?.summary.total ?? 0],
            [text("사용 가능", "Enabled"), props.page?.summary.enabled ?? 0],
            [text("확인 필요", "Issues"), props.page?.summary.issueCount ?? 0],
            [text("검색 결과", "Matches"), props.page?.totalMatches ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white px-4 py-3">
              <span className="block text-xs text-stone-500">{label}</span>
              <strong className="mt-1 block text-xl">{value}</strong>
            </div>
          ))}
        </section>
        {readState.status === "failed" ||
        readState.status === "stale" ||
        (readState.status === "loading" && readState.data !== null) ? (
          <div className="mt-5">
            <ResourceReadStatusNotice
              state={readState}
              subject="agents"
              text={text}
              onRefresh={props.onRefresh}
            />
          </div>
        ) : null}
        {readState.status !== "failed" && (props.page?.summary.issueCount ?? 0) > 0 ? (
          <InlineNotice
            className="mt-5"
            tone="warning"
            title={text("저장된 연결을 확인해야 합니다", "Saved bindings need attention")}
          >
            {text(
              "대상이 없는 연결 정보가 있습니다. 새로고침 후에도 계속되면 연결 설정에서 정리해 주세요.",
              "Some bindings have no target. Refresh, then remove them from capability bindings if they remain.",
            )}
          </InlineNotice>
        ) : null}
        {props.loading && !props.page ? (
          <div className="mt-6 grid gap-3">
            <Skeleton
              width="100%"
              height="88px"
              label={text("에이전트 불러오는 중", "Loading agents")}
            />
          </div>
        ) : null}
        <section
          className="mt-5 rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white"
          aria-label={text("서브 에이전트 목록", "Sub-agent list")}
        >
          <div className="grid gap-3 border-b border-stone-200 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_18rem_12rem]">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-950">
                  {text("에이전트 목록", "Agent list")}
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  {text(
                    "카드를 선택하면 아래 설정 패널의 내용이 바뀝니다.",
                    "Selecting a card updates the settings panel below.",
                  )}
                </p>
              </div>
              <StatusLabel tone="neutral">{String(props.page?.items.length ?? 0)}</StatusLabel>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              <span>{text("검색", "Search")}</span>
              <input
                aria-label={text("에이전트 검색", "Search agents")}
                value={props.search}
                onChange={(event) => props.onSearch(event.target.value)}
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span>{text("상태", "Status")}</span>
              <select
                value={props.status}
                onChange={(event) => props.onStatus(event.target.value as StatusFilter)}
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3"
              >
                <option value="">{text("전체", "All")}</option>
                <option value="enabled">{text("사용 가능", "Enabled")}</option>
                <option value="disabled">{text("비활성", "Disabled")}</option>
                <option value="archived">{text("보관됨", "Archived")}</option>
                <option value="degraded">{text("확인 필요", "Degraded")}</option>
              </select>
            </label>
          </div>
          {!props.loading && readState.status !== "failed" && props.page?.items.length === 0 ? (
            <InlineNotice
              className="m-3"
              tone="info"
              title={text("등록된 서브 에이전트가 없습니다", "No sub-agents")}
            >
              {text("설정된 에이전트가 없습니다.", "No agents are configured.")}
            </InlineNotice>
          ) : null}
          <div className="grid max-h-[18rem] grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {props.page?.items.map((item) => {
              const selected = props.selected?.agentRef === item.agentRef
              return (
                <button
                  key={item.agentRef}
                  ref={props.savedAgent?.agentRef === item.agentRef ? savedAgentRef : undefined}
                  type="button"
                  data-agent-ref={item.agentRef}
                  aria-pressed={selected}
                  onClick={(event) => {
                    returnFocusRef.current = event.currentTarget
                    props.onSelect(item.agentRef, event.currentTarget)
                  }}
                  className={`min-h-[5.5rem] rounded-[var(--ui-surface-radius)] border px-4 py-3 text-left focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)] ${
                    selected
                      ? "border-stone-900 bg-stone-950 text-white"
                      : props.savedAgent?.agentRef === item.agentRef
                        ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100"
                        : "border-stone-200 bg-white hover:border-stone-400"
                  }`}
                >
                  <span className="flex min-w-0 items-start justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">{item.name}</strong>
                      <span
                        className={`mt-1 block truncate text-xs ${
                          selected ? "text-stone-200" : "text-stone-600"
                        }`}
                      >
                        {item.role || text("역할 미지정", "No role")}
                      </span>
                    </span>
                    <StatusLabel
                      tone={
                        item.status === "enabled"
                          ? "success"
                          : item.status === "degraded"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {item.status}
                    </StatusLabel>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
        <section
          className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]"
          aria-label={text("서브 에이전트 작업대", "Sub-agent workspace")}
        >
          <div
            className="min-h-[36rem] overflow-hidden rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white xl:h-[calc(100dvh-18rem)]"
            aria-label={text("에이전트 구성", "Agent configuration")}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-950">
                  {text("에이전트 구성", "Agent configuration")}
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  {text(
                    "메인 에이전트는 보이지 않는 기준점이며, 서브 에이전트와 위임 관계만 표시합니다.",
                    "The main agent is implicit; only sub-agents and delegation links are shown.",
                  )}
                </p>
              </div>
              <Button
                className="!min-h-11"
                onClick={props.onRelationshipRecover}
                pending={props.relationshipLoading}
              >
                {text("구성 새로고침", "Refresh configuration")}
              </Button>
            </div>
            <div className="h-[calc(100%-4.75rem)] min-h-[31rem]">
              {props.relationshipError ? (
                <div className="p-4">
                  <UserRecoveryNotice
                    projection={props.relationshipError}
                    subject="agents"
                    text={text}
                    onAction={
                      props.relationshipError.action === "refresh_state"
                        ? props.onRelationshipRecover
                        : undefined
                    }
                  />
                </div>
              ) : null}
              {props.relationshipProjection && props.page ? (
                <React.Suspense
                  fallback={
                    <Skeleton
                      width="100%"
                      height="100%"
                      label={text("관계 화면 불러오는 중", "Loading relationship canvas")}
                    />
                  }
                >
                  <LazyAgentRelationshipCanvas
                    agents={props.page.items}
                    projection={props.relationshipProjection}
                    selectedRef={props.selected?.agentRef}
                    onSelect={props.onSelect}
                  />
                </React.Suspense>
              ) : props.relationshipLoading ? (
                <Skeleton
                  width="100%"
                  height="100%"
                  label={text("관계 불러오는 중", "Loading relationships")}
                />
              ) : null}
            </div>
          </div>
          <aside
            className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white"
            aria-label={text("에이전트 설정", "Agent settings")}
          >
            <div className="border-b border-stone-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-stone-950">
                {props.selected?.name ?? text("에이전트 설정", "Agent settings")}
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                {text(
                  "선택한 에이전트의 설정을 이 패널에서 바로 편집합니다.",
                  "Edit the selected agent in this panel.",
                )}
              </p>
            </div>
            <div className="max-h-none overflow-y-auto p-4 xl:max-h-[calc(100dvh-22rem)]">
              {selectedSettingsPanel}
            </div>
          </aside>
        </section>
      </div>
      <Drawer
        open={props.drawerMode === "create"}
        title={text("에이전트 추가", "Add agent")}
        returnFocusRef={returnFocusRef}
        closeOnEscape={!props.saving}
        closeDisabled={props.saving}
        onClose={() => {
          if (!props.saving) props.onClose()
        }}
      >
        {props.drawerMode === "create" || props.selected ? (
          <div className="grid gap-5">
            {props.selected ? (
              <div>
                <StatusLabel tone={props.selected.status === "enabled" ? "success" : "neutral"}>
                  {props.selected.status}
                </StatusLabel>
                <p className="mt-3 text-sm text-stone-600">{props.selected.role}</p>
              </div>
            ) : null}
            {props.selected ? (
              <div className="grid gap-3">
                <nav
                  className="grid grid-cols-3 gap-2"
                  aria-label={text("주요 설정", "Primary settings")}
                >
                  {[
                    ["basic", text("기본", "Basic")],
                    ["capabilities", text("기능", "Capabilities")],
                    ["delegation", text("위임", "Delegation")],
                  ].map(([section, label]) => (
                    <button
                      key={section}
                      type="button"
                      aria-pressed={(props.activeSection ?? "basic") === section}
                      disabled={props.saving}
                      onClick={() => props.onSection?.(section as AgentDetailSection)}
                      className={`min-h-11 rounded-[var(--ui-surface-radius)] border px-3 text-sm font-semibold ${
                        (props.activeSection ?? "basic") === section
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <details
                  open={advancedOpen}
                  onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
                  className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-stone-50"
                >
                  <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-stone-800">
                    {text("고급 설정", "Advanced settings")}
                  </summary>
                  <nav
                    className="grid grid-cols-3 gap-2 border-t border-stone-200 p-3"
                    aria-label={text("고급 설정", "Advanced settings")}
                  >
                    {[
                      ["ai", "AI"],
                      ["memory", text("메모리", "Memory")],
                      ["permissions", text("권한", "Permissions")],
                    ].map(([section, label]) => (
                      <button
                        key={section}
                        type="button"
                        aria-pressed={(props.activeSection ?? "basic") === section}
                        disabled={props.saving}
                        onClick={() => props.onSection?.(section as AgentDetailSection)}
                        className={`min-h-11 rounded-[var(--ui-surface-radius)] border px-3 text-sm font-semibold ${
                          (props.activeSection ?? "basic") === section
                            ? "border-stone-900 bg-stone-900 text-white"
                            : "border-stone-200 bg-white text-stone-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                </details>
              </div>
            ) : null}
            {props.drawerMode === "create" || (props.activeSection ?? "basic") === "basic" ? (
              <div className="grid gap-3 border-b border-stone-200 pb-5">
                <label className="grid gap-1 text-sm font-medium">
                  <span>{text("이름", "Name")}</span>
                  <input
                    aria-label={text("에이전트 이름", "Agent name")}
                    value={props.draftName ?? props.selected?.name ?? ""}
                    disabled={props.saving}
                    onChange={(event) => props.onDraftName?.(event.target.value)}
                    className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  <span>{text("역할", "Role")}</span>
                  <textarea
                    aria-label={text("에이전트 역할", "Agent role")}
                    value={props.draftRole ?? props.selected?.role ?? ""}
                    disabled={props.saving}
                    onChange={(event) => props.onDraftRole?.(event.target.value)}
                    rows={3}
                    className="rounded-[var(--ui-surface-radius)] border border-stone-300 px-3 py-2"
                  />
                </label>
                {props.mutationError ? (
                  <div ref={mutationNoticeRef} tabIndex={-1} className="outline-none">
                    <UserRecoveryNotice
                      projection={props.mutationError}
                      subject="agents"
                      text={text}
                      onAction={
                        props.mutationError.action === "refresh_state"
                          ? props.onMutationRecover
                          : undefined
                      }
                    />
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button onClick={props.onClose} disabled={props.saving}>
                    {text("취소", "Cancel")}
                  </Button>
                  <Button variant="primary" pending={props.saving} onClick={props.onSave}>
                    {text("저장", "Save")}
                  </Button>
                </div>
              </div>
            ) : null}
            {props.selected && (props.activeSection ?? "basic") === "basic" ? (
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-stone-500">{text("상위", "Parent")}</dt>
                  <dd className="font-medium">{props.selected.parentName}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">
                    {text("연결된 기능", "Connected capabilities")}
                  </dt>
                  <dd className="font-medium">
                    {[
                      ...props.selected.bindingNames.skills,
                      ...props.selected.bindingNames.mcpServers,
                      ...props.selected.bindingNames.yeonjang,
                    ].join(", ") || text("없음", "None")}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">{text("하위 에이전트", "Child agents")}</dt>
                  <dd className="font-medium">
                    {props.selected.directChildNames.join(", ") || text("없음", "None")}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">{text("연결", "Bindings")}</dt>
                  <dd className="font-medium">
                    Skills {props.selected.bindingCounts.skills} · MCP{" "}
                    {props.selected.bindingCounts.mcpServers} · {text("연장", "Yeonjang")}{" "}
                    {props.selected.bindingCounts.yeonjang}
                  </dd>
                </div>
              </dl>
            ) : null}
            {props.selected && (props.activeSection ?? "basic") === "capabilities" ? (
              <section
                className="grid min-w-0 gap-4 overflow-hidden"
                aria-label={text("기능 연결", "Capability bindings")}
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <input
                    aria-label={text("기능 검색", "Search capabilities")}
                    value={props.capabilitySearch ?? ""}
                    disabled={props.saving}
                    onChange={(event) => props.onCapabilitySearch?.(event.target.value)}
                    placeholder={text("이름 검색", "Search by name")}
                    className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 px-3"
                  />
                  <select
                    aria-label={text("기능 종류", "Capability kind")}
                    value={props.capabilityKind ?? ""}
                    disabled={props.saving}
                    onChange={(event) =>
                      props.onCapabilityKind?.(event.target.value as AgentCapabilityKind | "")
                    }
                    className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 px-3"
                  >
                    <option value="">{text("전체", "All")}</option>
                    <option value="skill">{text("스킬", "Skills")}</option>
                    <option value="mcp_server">MCP</option>
                    <option value="yeonjang">{text("연장", "Yeonjang")}</option>
                  </select>
                </div>
                {props.capabilityError ? (
                  <UserRecoveryNotice
                    projection={props.capabilityError}
                    subject="agents"
                    text={text}
                    onAction={
                      props.capabilityError.action === "refresh_state"
                        ? props.onCapabilityRecover
                        : undefined
                    }
                  />
                ) : null}
                {props.capabilityMutation?.state === "failed" ? (
                  <InlineNotice
                    tone="warning"
                    title={text("일부 연결을 확인해야 합니다", "Some bindings need review")}
                  >
                    {text(
                      `${props.capabilityMutation.appliedCount}개 적용, ${props.capabilityMutation.rejectedCount}개 미적용`,
                      `${props.capabilityMutation.appliedCount} applied, ${props.capabilityMutation.rejectedCount} not applied`,
                    )}
                  </InlineNotice>
                ) : null}
                {props.capabilityProjection?.orphanReasonCodes.length ? (
                  <InlineNotice
                    tone="warning"
                    title={text("연결 확인 필요", "Binding needs review")}
                  >
                    {text(
                      "대상이 없는 연결이 있어 편집할 수 없습니다.",
                      "An orphaned binding cannot be edited.",
                    )}
                  </InlineNotice>
                ) : null}
                {props.capabilityLoading && !props.capabilityProjection ? (
                  <Skeleton
                    width="100%"
                    height="120px"
                    label={text("기능 불러오는 중", "Loading capabilities")}
                  />
                ) : null}
                {!props.capabilityLoading && props.capabilityProjection?.items.length === 0 ? (
                  <InlineNotice
                    tone="info"
                    title={text("등록된 기능이 없습니다", "No capabilities")}
                  >
                    {text(
                      "공통 목록에 등록된 스킬, MCP 또는 연장이 없습니다.",
                      "No Skill, MCP, or Yeonjang entries are registered.",
                    )}
                  </InlineNotice>
                ) : null}
                <div className="grid gap-2">
                  {props.capabilityProjection?.items
                    .filter((item) => {
                      const searchValue = (props.capabilitySearch ?? "").trim().toLocaleLowerCase()
                      return (
                        (!(props.capabilityKind ?? "") || item.kind === props.capabilityKind) &&
                        (!searchValue || item.displayName.toLocaleLowerCase().includes(searchValue))
                      )
                    })
                    .map((item) => {
                      const checked = props.capabilityDraft?.[item.capabilityRef] ?? item.bound
                      const changed = checked !== item.bound
                      return (
                        <label
                          key={item.capabilityRef}
                          className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--ui-surface-radius)] border border-stone-200 px-3 py-2"
                        >
                          <span className="min-w-0">
                            <strong className="block truncate text-sm">{item.displayName}</strong>
                            <span className="mt-1 flex flex-wrap gap-2 text-xs text-stone-500">
                              <span>{capabilityKindLabel(item.kind, text)}</span>
                              <span>{item.runtimeStatus}</span>
                              {changed ? (
                                <span className="font-semibold text-amber-700">
                                  {text("변경", "Changed")}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            aria-label={`${item.displayName} ${text("연결", "binding")}`}
                            checked={checked}
                            disabled={!item.editable || props.saving}
                            onChange={(event) =>
                              props.onCapabilityToggle?.(item.capabilityRef, event.target.checked)
                            }
                            className="h-5 w-5 shrink-0"
                          />
                        </label>
                      )
                    })}
                </div>
                <div className="sticky bottom-0 flex min-w-0 items-center justify-between gap-3 border-t border-stone-200 bg-white py-3">
                  <span className="text-sm text-stone-600">
                    {text("변경", "Changes")}{" "}
                    {props.capabilityProjection?.items.filter(
                      (item) =>
                        (props.capabilityDraft?.[item.capabilityRef] ?? item.bound) !== item.bound,
                    ).length ?? 0}
                  </span>
                  <Button
                    variant="primary"
                    className="shrink-0"
                    pending={props.saving}
                    disabled={
                      props.capabilityMutation?.requiresRefresh === true ||
                      !props.capabilityProjection?.items.some(
                        (item) =>
                          (props.capabilityDraft?.[item.capabilityRef] ?? item.bound) !==
                          item.bound,
                      )
                    }
                    onClick={props.onCapabilitySave}
                  >
                    {text("기능 저장", "Save capabilities")}
                  </Button>
                </div>
              </section>
            ) : null}
            {props.selected && operationalSection ? (
              <section
                className="grid min-w-0 gap-4"
                aria-label={text("에이전트 운영 설정", "Agent operational settings")}
              >
                {props.settingsError ? (
                  <InlineNotice
                    tone="danger"
                    title={text("설정을 불러오지 못했습니다", "Could not load settings")}
                  >
                    {props.settingsError}
                  </InlineNotice>
                ) : null}
                {props.settingsLoading && !props.settingsProjection ? (
                  <Skeleton
                    width="100%"
                    height="160px"
                    label={text("설정 불러오는 중", "Loading settings")}
                  />
                ) : null}
                {props.settingsProjection?.diagnosticCodes.length ? (
                  <InlineNotice
                    tone="warning"
                    title={text("설정 확인 필요", "Settings need review")}
                  >
                    {props.settingsProjection.diagnosticCodes.join(", ")}
                  </InlineNotice>
                ) : null}
                {props.activeSection &&
                operationalSection &&
                props.settingsProjection &&
                props.settingsDraft ? (
                  <AgentOperationalSettingsEditor
                    section={props.activeSection as AgentOperationalSettingsSection}
                    projection={props.settingsProjection}
                    draft={props.settingsDraft}
                    saving={Boolean(props.saving)}
                    elevationConfirmed={Boolean(props.settingsElevationConfirmed)}
                    onDraft={(draft) => props.onSettingsDraft?.(draft)}
                    onElevationConfirmed={(confirmed) =>
                      props.onSettingsElevationConfirmed?.(confirmed)
                    }
                    onSave={() =>
                      props.onSettingsSave?.(props.activeSection as AgentOperationalSettingsSection)
                    }
                    text={text}
                  />
                ) : null}
              </section>
            ) : null}
            {props.selected && (props.activeSection ?? "basic") === "delegation" ? (
              <section
                className="grid min-w-0 gap-4"
                aria-label={text("위임 설정", "Delegation settings")}
              >
                {props.relationshipError ? (
                  <UserRecoveryNotice
                    projection={props.relationshipError}
                    subject="agents"
                    text={text}
                    onAction={
                      props.relationshipError.action === "refresh_state"
                        ? props.onRelationshipRecover
                        : undefined
                    }
                  />
                ) : null}
                {props.relationshipLoading && !props.relationshipProjection ? (
                  <Skeleton
                    width="100%"
                    height="120px"
                    label={text("위임 불러오는 중", "Loading delegation")}
                  />
                ) : null}
                {props.relationshipProjection ? (
                  <>
                    <label className="grid gap-1 text-sm font-medium">
                      <span>{text("상위 에이전트", "Parent agent")}</span>
                      <select
                        aria-label={text("상위 에이전트", "Parent agent")}
                        value={props.relationshipParentDraft ?? ""}
                        disabled={props.saving}
                        onChange={(event) =>
                          props.onRelationshipParentDraft?.(event.target.value || null)
                        }
                        className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3"
                      >
                        <option value="">{text("연결 없음", "No parent")}</option>
                        <option value={props.relationshipProjection.root.agentRef}>
                          {props.relationshipProjection.root.name} {text("직속", "direct")}
                        </option>
                        {agentParentCandidates({
                          selectedRef: props.selected.agentRef,
                          agents: props.page?.items ?? [],
                          projection: props.relationshipProjection,
                        }).map((agent) => (
                          <option key={agent.agentRef} value={agent.agentRef}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-sm leading-6 text-stone-600">
                      {text(
                        "자기 자신과 하위 에이전트는 상위 후보에서 제외됩니다.",
                        "The selected agent and its descendants cannot be parents.",
                      )}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        pending={props.saving}
                        onClick={props.onRelationshipSave}
                      >
                        {text("위임 저장", "Save delegation")}
                      </Button>
                    </div>
                  </>
                ) : null}
              </section>
            ) : null}
            {props.selected &&
            (props.activeSection ?? "basic") === "basic" &&
            props.selected.status !== "archived" ? (
              <section className="border-t border-stone-200 pt-5">
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={props.archiveConfirmed ?? false}
                    disabled={props.saving}
                    onChange={(event) => props.onArchiveConfirmed?.(event.target.checked)}
                  />
                  {text(
                    `하위 ${props.selected.directChildCount}개와 연결 ${Object.values(props.selected.bindingCounts).reduce((sum, count) => sum + count, 0)}개의 영향을 확인했습니다.`,
                    `I reviewed the impact on ${props.selected.directChildCount} children and ${Object.values(props.selected.bindingCounts).reduce((sum, count) => sum + count, 0)} bindings.`,
                  )}
                </label>
                <Button
                  variant="danger"
                  className="mt-2 w-full"
                  disabled={!props.archiveConfirmed || props.saving}
                  pending={props.saving}
                  onClick={props.onArchive}
                >
                  {text("에이전트 보관", "Archive agent")}
                </Button>
              </section>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}

export function AgentsPage() {
  const { text } = useUiI18n()
  const [readState, setReadState] =
    useState<ResourceReadState<AgentWorkspacePageResponse>>(initialResourceReadState)
  const page = readState.data
  const loading = readState.status === "loading"
  const [selected, setSelected] = useState<AgentWorkspaceDetail | null>(null)
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [status, setStatus] = useState<StatusFilter>("")
  const [revision, setRevision] = useState(0)
  const [drawerMode, setDrawerMode] = useState<"create" | "detail">("detail")
  const [draftName, setDraftName] = useState("")
  const [draftRole, setDraftRole] = useState("")
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [mutationError, setMutationError] = useState<UserRecoveryProjection | null>(null)
  const [archiveConfirmed, setArchiveConfirmed] = useState(false)
  const [activeSection, setActiveSection] = useState<AgentDetailSection>("basic")
  const [capabilityReadState, setCapabilityReadState] =
    useState<ResourceReadState<AgentCapabilityBindingProjection>>(initialResourceReadState)
  const [capabilityReadRevision, setCapabilityReadRevision] = useState(0)
  const capabilityProjection = capabilityReadState.data
  const capabilityLoading = capabilityReadState.status === "loading"
  const [capabilityDraft, setCapabilityDraft] = useState<Record<string, boolean>>({})
  const [capabilitySearch, setCapabilitySearch] = useState("")
  const [capabilityKind, setCapabilityKind] = useState<AgentCapabilityKind | "">("")
  const [capabilityError, setCapabilityError] = useState<UserRecoveryProjection | null>(null)
  const [capabilityMutation, setCapabilityMutation] = useState<AgentBindingMutationState>(
    initialAgentBindingMutation,
  )
  const [relationshipReadState, setRelationshipReadState] =
    useState<ResourceReadState<AgentRelationshipProjection>>(initialResourceReadState)
  const [relationshipReadRevision, setRelationshipReadRevision] = useState(0)
  const relationshipProjection = relationshipReadState.data
  const relationshipLoading = relationshipReadState.status === "loading"
  const [relationshipError, setRelationshipError] = useState<UserRecoveryProjection | null>(null)
  const [relationshipParentDraft, setRelationshipParentDraft] = useState<string | null>(null)
  const [settingsProjection, setSettingsProjection] =
    useState<AgentOperationalSettingsProjection | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<AgentOperationalSettingsDraft | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsElevationConfirmed, setSettingsElevationConfirmed] = useState(false)
  const [savedAgent, setSavedAgent] = useState<{ agentRef: string; name: string } | null>(null)
  const settingsSectionActive =
    activeSection === "ai" || activeSection === "memory" || activeSection === "permissions"
  useEffect(() => {
    void revision
    const controller = new AbortController()
    setReadState((current) => reduceResourceReadState(current, { type: "load_started" }))
    void api
      .getAgentWorkspace(
        { search: deferredSearch, ...(status ? { status } : {}), limit: 100 },
        controller.signal,
      )
      .then((projection) =>
        setReadState((current) =>
          reduceResourceReadState(current, {
            type: "load_succeeded",
            data: projection,
            observedAt: projection.observedAt,
          }),
        ),
      )
      .catch((reason) => {
        if (!controller.signal.aborted)
          setReadState((current) =>
            reduceResourceReadState(current, {
              type: "load_failed",
              failure: projectUserRecovery(reason, "read"),
            }),
          )
      })
    return () => controller.abort()
  }, [deferredSearch, status, revision])
  useEffect(() => {
    void capabilityReadRevision
    if (!selected || activeSection !== "capabilities") return
    const controller = new AbortController()
    setCapabilityError(null)
    setCapabilityReadState((current) => reduceResourceReadState(current, { type: "load_started" }))
    void api
      .getAgentCapabilityBindings(selected.agentRef, { limit: 100 }, controller.signal)
      .then((projection) => {
        if (controller.signal.aborted) return
        setCapabilityReadState((current) =>
          reduceResourceReadState(current, {
            type: "load_succeeded",
            data: projection,
            observedAt: projection.observedAt,
          }),
        )
        setCapabilityMutation(initialAgentBindingMutation)
        setCapabilityDraft(
          Object.fromEntries(projection.items.map((item) => [item.capabilityRef, item.bound])),
        )
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setCapabilityReadState((current) =>
            reduceResourceReadState(current, {
              type: "load_failed",
              failure: projectUserRecovery(reason, "read"),
            }),
          )
      })
    return () => controller.abort()
  }, [activeSection, capabilityReadRevision, selected])
  useEffect(() => {
    void relationshipReadRevision
    const controller = new AbortController()
    setRelationshipError(null)
    setRelationshipReadState((current) =>
      reduceResourceReadState(current, { type: "load_started" }),
    )
    void api
      .getAgentRelationships({ limit: 100 }, controller.signal)
      .then((projection) => {
        if (controller.signal.aborted) return
        setRelationshipReadState((current) =>
          reduceResourceReadState(current, {
            type: "load_succeeded",
            data: projection,
            observedAt: projection.observedAt,
          }),
        )
        if (selected) {
          const current = projection.relationships.find(
            (relationship) => relationship.childRef === selected.agentRef,
          )
          setRelationshipParentDraft(current?.parentRef ?? null)
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setRelationshipReadState((current) =>
            reduceResourceReadState(current, {
              type: "load_failed",
              failure: projectUserRecovery(reason, "read"),
            }),
          )
      })
    return () => controller.abort()
  }, [relationshipReadRevision, selected])
  useEffect(() => {
    if (!selected || !settingsSectionActive || settingsProjection?.agentRef === selected.agentRef)
      return
    const ownerRef = selected.agentRef
    const controller = new AbortController()
    setSettingsLoading(true)
    setSettingsError(null)
    void api
      .getAgentOperationalSettings(ownerRef, controller.signal)
      .then((projection) => {
        if (projection.agentRef !== ownerRef) throw new Error("agent_settings_owner_mismatch")
        setSettingsProjection(projection)
        setSettingsDraft(createAgentOperationalSettingsDraft(projection))
        setSettingsElevationConfirmed(false)
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setSettingsError(operationalSettingsErrorMessage(reason, text))
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettingsLoading(false)
      })
    return () => controller.abort()
  }, [selected, settingsProjection, settingsSectionActive, text])
  return (
    <AgentsView
      page={page}
      selected={selected}
      loading={loading}
      readState={readState}
      search={search}
      status={status}
      drawerMode={drawerMode}
      draftName={draftName}
      draftRole={draftRole}
      saving={saving}
      mutationError={mutationError}
      archiveConfirmed={archiveConfirmed}
      activeSection={activeSection}
      capabilityProjection={capabilityProjection}
      capabilityDraft={capabilityDraft}
      capabilityLoading={capabilityLoading}
      capabilitySearch={capabilitySearch}
      capabilityKind={capabilityKind}
      capabilityError={capabilityError ?? capabilityReadState.failure}
      capabilityMutation={capabilityMutation}
      relationshipProjection={relationshipProjection}
      relationshipLoading={relationshipLoading}
      relationshipError={relationshipError ?? relationshipReadState.failure}
      savedAgent={savedAgent}
      relationshipParentDraft={relationshipParentDraft}
      settingsProjection={
        settingsProjection?.agentRef === selected?.agentRef ? settingsProjection : null
      }
      settingsDraft={settingsDraft?.agentRef === selected?.agentRef ? settingsDraft : null}
      settingsLoading={settingsLoading}
      settingsError={settingsError}
      settingsElevationConfirmed={settingsElevationConfirmed}
      onSearch={setSearch}
      onStatus={setStatus}
      onRefresh={() => setRevision((value) => value + 1)}
      onAdd={() => {
        setSavedAgent(null)
        setSelected(null)
        setDrawerMode("create")
        setDraftName("")
        setDraftRole("")
        setMutationError(null)
        setArchiveConfirmed(false)
        setActiveSection("basic")
        setCapabilityReadState(initialResourceReadState())
        setCapabilityDraft({})
        setRelationshipParentDraft(null)
        setSettingsProjection(null)
        setSettingsDraft(null)
        setSettingsError(null)
        setSettingsElevationConfirmed(false)
      }}
      onSelect={(ref) => {
        setSavedAgent(null)
        const controller = new AbortController()
        void api.getAgentWorkspaceDetail(ref, controller.signal).then((detail) => {
          setSelected(detail)
          setDrawerMode("detail")
          setDraftName(detail.name)
          setDraftRole(detail.role)
          setMutationError(null)
          setArchiveConfirmed(false)
          setActiveSection("basic")
          setCapabilityReadState(initialResourceReadState())
          setCapabilityDraft({})
          setCapabilityError(null)
          setCapabilityMutation(initialAgentBindingMutation)
          const relationship = relationshipProjection?.relationships.find(
            (item) => item.childRef === detail.agentRef,
          )
          setRelationshipParentDraft(relationship?.parentRef ?? null)
          setRelationshipError(null)
          setSettingsProjection(null)
          setSettingsDraft(null)
          setSettingsError(null)
          setSettingsElevationConfirmed(false)
        })
      }}
      onDraftName={setDraftName}
      onDraftRole={setDraftRole}
      onArchiveConfirmed={setArchiveConfirmed}
      onClose={() => {
        if (savingRef.current) return
        setSelected(null)
        setDrawerMode("detail")
        setMutationError(null)
        setActiveSection("basic")
        setCapabilityReadState(initialResourceReadState())
        setCapabilityDraft({})
        setRelationshipParentDraft(null)
        setSettingsProjection(null)
        setSettingsDraft(null)
        setSettingsError(null)
        setSettingsElevationConfirmed(false)
      }}
      onSection={(section) => {
        setActiveSection(section)
        if (section === "delegation" && selected && relationshipProjection) {
          const relationship = relationshipProjection.relationships.find(
            (item) => item.childRef === selected.agentRef,
          )
          setRelationshipParentDraft(relationship?.parentRef ?? null)
        }
      }}
      onCapabilitySearch={setCapabilitySearch}
      onCapabilityKind={setCapabilityKind}
      onCapabilityToggle={(capabilityRef, bound) =>
        setCapabilityDraft((current) => ({ ...current, [capabilityRef]: bound }))
      }
      onCapabilityRecover={() => {
        setCapabilityError(null)
        setCapabilityReadRevision((value) => value + 1)
      }}
      onRelationshipParentDraft={setRelationshipParentDraft}
      onRelationshipRecover={() => {
        setRelationshipError(null)
        setRelationshipReadRevision((value) => value + 1)
      }}
      onMutationRecover={() => {
        setMutationError(null)
        setRevision((value) => value + 1)
      }}
      onSettingsDraft={setSettingsDraft}
      onSettingsElevationConfirmed={setSettingsElevationConfirmed}
      onSettingsSave={(section) => {
        if (!selected || !settingsProjection || !settingsDraft || saving) return
        if (settingsDraft.agentRef !== selected.agentRef) return
        if (validateOperationalSettingsDraft(section, settingsDraft)) return
        savingRef.current = true
        setSaving(true)
        setSettingsError(null)
        const idempotencyKey = globalThis.crypto.randomUUID()
        const request = buildOperationalSettingsMutationRequest({
          section,
          draft: settingsDraft,
          confirmElevation: settingsElevationConfirmed,
        })
        void api
          .updateAgentOperationalSettings(selected.agentRef, request, idempotencyKey)
          .then(async (receipt) => {
            if (receipt.state !== "active")
              throw new Error(receipt.reasonCode ?? "agent_settings_mutation_failed")
            const [verifiedSettings, detail] = await Promise.all([
              api.getAgentOperationalSettings(selected.agentRef),
              api.getAgentWorkspaceDetail(selected.agentRef),
            ])
            if (
              verifiedSettings.agentRef !== selected.agentRef ||
              verifiedSettings.revision !== receipt.revision ||
              detail.profileVersion !== receipt.revision
            )
              throw new Error("agent_settings_verification_failed")
            setSettingsProjection(verifiedSettings)
            setSettingsDraft(createAgentOperationalSettingsDraft(verifiedSettings))
            setSettingsElevationConfirmed(false)
            setSelected(detail)
            setRevision((value) => value + 1)
          })
          .catch((reason) => setSettingsError(operationalSettingsErrorMessage(reason, text)))
          .finally(() => {
            savingRef.current = false
            setSaving(false)
          })
      }}
      onRelationshipSave={() => {
        if (!selected || !relationshipProjection || savingRef.current) return
        const current = relationshipProjection.relationships.find(
          (relationship) => relationship.childRef === selected.agentRef,
        )
        if ((current?.parentRef ?? null) === relationshipParentDraft) return
        const kind = current ? (relationshipParentDraft ? "reparent" : "disconnect") : "connect"
        if (kind === "connect" && !relationshipParentDraft) return
        savingRef.current = true
        setSaving(true)
        setRelationshipError(null)
        const id = globalThis.crypto.randomUUID()
        void api
          .updateAgentParent(selected.agentRef, {
            kind,
            parentRef: relationshipParentDraft,
            mutation: {
              actorRef: "webui",
              scope: "agent_relationship:write",
              mutationId: id,
              targetRevision: relationshipProjection.revision + 1,
              purpose: `relationship_${kind}`,
              issuedAt: Date.now(),
              nonce: id,
            },
          })
          .then(async (receipt) => {
            if (receipt.state !== "active") {
              setRelationshipError(projectAgentReceiptFailure(receipt.reasonCode))
              return
            }
            const verified = await api.getAgentRelationships({ limit: 100 })
            const verifiedRelationship = verified.relationships.find(
              (relationship) => relationship.childRef === selected.agentRef,
            )
            if ((verifiedRelationship?.parentRef ?? null) !== relationshipParentDraft) {
              setRelationshipError(projectAgentReceiptFailure("persisted_revision_mismatch"))
              return
            }
            const detail = await api.getAgentWorkspaceDetail(selected.agentRef)
            setRelationshipReadState((current) =>
              reduceResourceReadState(current, {
                type: "load_succeeded",
                data: verified,
                observedAt: verified.observedAt,
              }),
            )
            setSelected(detail)
            setRevision((value) => value + 1)
          })
          .catch((reason) => setRelationshipError(projectAgentFailure(reason)))
          .finally(() => {
            savingRef.current = false
            setSaving(false)
          })
      }}
      onCapabilitySave={() => {
        if (!selected || !capabilityProjection || savingRef.current) return
        const changes = capabilityProjection.items.filter(
          (item) => (capabilityDraft[item.capabilityRef] ?? item.bound) !== item.bound,
        )
        if (changes.length === 0) return
        savingRef.current = true
        setSaving(true)
        setCapabilityError(null)
        setCapabilityMutation((current) =>
          reduceAgentBindingMutation(current, {
            type: "save_started",
            requestedCount: changes.length,
          }),
        )
        let appliedCount = 0
        let rejectedCount = 0
        let recovery: UserRecoveryProjection | null = null
        void (async () => {
          const revisions = { ...capabilityProjection.revisions }
          const failedDraft: Record<string, boolean> = {}
          for (const item of changes) {
            const bound = capabilityDraft[item.capabilityRef] ?? item.bound
            const id = globalThis.crypto.randomUUID()
            try {
              const receipt = await api.updateAgentCapabilityBinding(
                selected.agentRef,
                item.capabilityRef,
                {
                  kind: item.kind,
                  bound,
                  mutation: {
                    actorRef: "webui",
                    scope: "capability:write",
                    mutationId: id,
                    targetRevision: revisions[item.kind] + 1,
                    purpose: capabilityPurpose(item.kind, bound),
                    issuedAt: Date.now(),
                    nonce: id,
                  },
                },
              )
              if (receipt.state !== "active") {
                rejectedCount += 1
                failedDraft[item.capabilityRef] = bound
                recovery ??= projectAgentReceiptFailure(receipt.reasonCode)
                continue
              }
              revisions[item.kind] = receipt.revision
              appliedCount += 1
            } catch (reason) {
              failedDraft[item.capabilityRef] = bound
              rejectedCount += 1
              recovery ??= projectAgentFailure(reason)
            }
          }
          const verified = await api.getAgentCapabilityBindings(selected.agentRef, { limit: 100 })
          setCapabilityReadState((current) =>
            reduceResourceReadState(current, {
              type: "load_succeeded",
              data: verified,
              observedAt: verified.observedAt,
            }),
          )
          setCapabilityDraft({
            ...Object.fromEntries(verified.items.map((item) => [item.capabilityRef, item.bound])),
            ...failedDraft,
          })
          const detail = await api.getAgentWorkspaceDetail(selected.agentRef)
          setSelected(detail)
          setRevision((value) => value + 1)
          setCapabilityMutation((current) =>
            reduceAgentBindingMutation(current, {
              type: "save_finished",
              appliedCount,
              rejectedCount,
              verified: true,
              recovery,
            }),
          )
          if (recovery) setCapabilityError(recovery)
        })()
          .catch((reason) => {
            const recovery = projectAgentFailure(reason)
            setCapabilityError(recovery)
            setCapabilityMutation((current) =>
              current.state === "saving"
                ? reduceAgentBindingMutation(current, {
                    type: "save_finished",
                    appliedCount,
                    rejectedCount,
                    verified: false,
                    recovery,
                  })
                : current,
            )
          })
          .finally(() => {
            savingRef.current = false
            setSaving(false)
          })
      }}
      onSave={() => {
        if (savingRef.current) return
        savingRef.current = true
        setSaving(true)
        setMutationError(null)
        const id = globalThis.crypto.randomUUID()
        const mutation = {
          mutationId: id,
          nonce: id,
          actorRef: "webui",
          scope: "agent_identity" as const,
        }
        const creating = drawerMode === "create"
        const operation = creating
          ? api.createAgentIdentity({ mutation, name: draftName, role: draftRole })
          : selected
            ? api.updateAgentIdentity(selected.agentRef, {
                mutation,
                baseRevision: selected.profileVersion,
                name: draftName,
                role: draftRole,
              })
            : Promise.reject(new Error("agent_selection_required"))
        void operation
          .then(async (receipt) => {
            if (!receipt.agentRef) {
              setMutationError(projectAgentReceiptFailure("persisted_revision_mismatch"))
              return
            }
            const verified = await api.getAgentWorkspaceDetail(receipt.agentRef)
            if (creating) {
              const refreshed = await api.getAgentWorkspace({ limit: 100 })
              const visibility = confirmCreatedAgentVisible({
                agentRef: receipt.agentRef,
                revision: receipt.revision,
                detail: verified,
                page: refreshed,
              })
              if (!visibility.ok) {
                setMutationError(projectAgentReceiptFailure(visibility.reasonCode))
                return
              }
              setReadState((current) =>
                reduceResourceReadState(current, {
                  type: "load_succeeded",
                  data: refreshed,
                  observedAt: refreshed.observedAt,
                }),
              )
              setSearch(visibility.search)
              setStatus(visibility.status)
              setSelected(verified)
              setDraftName(verified.name)
              setDraftRole(verified.role)
              setDrawerMode(visibility.drawerMode)
              setSavedAgent(visibility.savedAgent)
              setActiveSection("basic")
              setRelationshipReadRevision((value) => value + 1)
              return
            }
            if (verified.profileVersion !== receipt.revision) {
              setMutationError(projectAgentReceiptFailure("persisted_revision_mismatch"))
              return
            }
            setSelected(verified)
            setDrawerMode("detail")
            setDraftName(verified.name)
            setDraftRole(verified.role)
            setRevision((value) => value + 1)
          })
          .catch((reason) => setMutationError(projectAgentFailure(reason)))
          .finally(() => {
            savingRef.current = false
            setSaving(false)
          })
      }}
      onArchive={() => {
        if (!selected || !archiveConfirmed || savingRef.current) return
        savingRef.current = true
        setSaving(true)
        setMutationError(null)
        const id = globalThis.crypto.randomUUID()
        void api
          .archiveAgentIdentity(selected.agentRef, {
            mutation: { mutationId: id, nonce: id, actorRef: "webui", scope: "agent_identity" },
            baseRevision: selected.profileVersion,
            confirmed: true,
          })
          .then(async (receipt) => {
            if (!receipt.agentRef) {
              setMutationError(projectAgentReceiptFailure("persisted_revision_mismatch"))
              return
            }
            const verified = await api.getAgentWorkspaceDetail(receipt.agentRef)
            if (verified.status !== "archived" || verified.profileVersion !== receipt.revision) {
              setMutationError(projectAgentReceiptFailure("persisted_revision_mismatch"))
              return
            }
            setSelected(null)
            setDrawerMode("detail")
            setRevision((value) => value + 1)
          })
          .catch((reason) => setMutationError(projectAgentFailure(reason)))
          .finally(() => {
            savingRef.current = false
            setSaving(false)
          })
      }}
    />
  )
}
