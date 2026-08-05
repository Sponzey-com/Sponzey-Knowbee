import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from "react"
import { api } from "../api/client"
import { UserRecoveryNotice } from "../components/UserRecoveryNotice"
import { CapabilityTabs } from "../components/capabilities/CapabilityTabs"
import { SkillAddDrawer } from "../components/capabilities/SkillAddDrawer"
import { SkillDetailDrawer } from "../components/capabilities/SkillDetailDrawer"
import { Button } from "../components/ui/Button"
import { InlineNotice } from "../components/ui/InlineNotice"
import { Skeleton } from "../components/ui/Skeleton"
import { StatusLabel, type StatusTone } from "../components/ui/StatusLabel"
import type { SkillCatalogPageResponse, SkillDetailResponse } from "../contracts/skills"
import {
  type SkillAddDraft,
  type SkillAddFlow,
  createSkillMutationRequest,
  initialSkillAddFlow,
  reduceSkillAddFlow,
} from "../lib/skill-add-flow"
import type {
  SkillCatalogProjection,
  SkillRuntimeStatus,
  SkillSourceKind,
} from "../lib/skill-catalog-contract"
import {
  type SkillBindingFlow,
  type SkillDetailDraft,
  type SkillDetailFlow,
  createSkillBindingRequest,
  createSkillDeleteRequest,
  createSkillUpdateRequest,
  initialSkillBindingFlow,
  initialSkillDetailFlow,
  reduceSkillBindingFlow,
  reduceSkillDetailFlow,
} from "../lib/skill-detail-flow"
import { useUiI18n } from "../lib/ui-i18n"
import { type UserRecoveryProjection, projectUserRecovery } from "../lib/user-recovery"

type SourceFilter = SkillSourceKind | ""
type RuntimeFilter = SkillRuntimeStatus | ""

function mergeBySkillRef(
  current: readonly SkillCatalogProjection[],
  incoming: readonly SkillCatalogProjection[],
) {
  const merged = new Map(current.map((item) => [item.skillRef, item]))
  for (const item of incoming) merged.set(item.skillRef, item)
  return [...merged.values()]
}

function statusTone(status: SkillRuntimeStatus): StatusTone {
  if (status === "active") return "success"
  if (status === "failed") return "danger"
  if (status === "restart_required") return "warning"
  return "neutral"
}

export interface SkillCatalogViewProps {
  items: readonly SkillCatalogProjection[]
  selectedItem: SkillDetailResponse | null
  loading: boolean
  loadingMore: boolean
  error: UserRecoveryProjection | null
  nextCursor: string | null
  search: string
  sourceKind: SourceFilter
  runtimeStatus: RuntimeFilter
  boundOnly: boolean
  onSearchChange: (value: string) => void
  onSourceKindChange: (value: SourceFilter) => void
  onRuntimeStatusChange: (value: RuntimeFilter) => void
  onBoundOnlyChange: (value: boolean) => void
  onSelect: (skillRef: string, trigger: HTMLElement) => void
  onCloseDetail: () => void
  onRefresh: () => void
  onLoadMore: () => void
  addOpen?: boolean
  addFlow?: SkillAddFlow
  onOpenAdd?: (trigger: HTMLElement) => void
  onCloseAdd?: () => void
  onAddDraftChange?: (patch: Partial<SkillAddDraft>) => void
  onValidateAdd?: () => void
  onSaveAdd?: () => void
  detailFlow?: SkillDetailFlow
  onEditDetail?: () => void
  onDetailDraftChange?: (patch: Partial<SkillDetailDraft>) => void
  onSaveDetail?: () => void
  onCancelDetailEdit?: () => void
  onToggleDetailStatus?: () => void
  bindingFlow?: SkillBindingFlow
  deleteFlow?: {
    state: "idle" | "confirming" | "deleting" | "failed"
    reasonCode: string | null
    agentNames: string[]
  }
  onEditBindings?: () => void
  onToggleBinding?: (agentRef: string) => void
  onSaveBindings?: () => void
  onCancelBindings?: () => void
  onStartDelete?: () => void
  onConfirmDelete?: () => void
  onCancelDelete?: () => void
}

export function SkillCatalogView(props: SkillCatalogViewProps) {
  const { text } = useUiI18n()
  const detailReturnRef = useRef<HTMLElement>(null)
  const addReturnRef = useRef<HTMLElement>(null)
  const selectedDetail = props.selectedItem
    ? {
        ...props.selectedItem,
        bindings: props.selectedItem.bindings ?? { boundAgents: [], availableAgents: [] },
      }
    : null
  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">
              {text("기능 연결", "Capabilities")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-stone-950">Skills</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {text(
                "에이전트가 사용할 Skill을 찾고 현재 상태를 확인합니다.",
                "Find Skills for agents and review their current state.",
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button onClick={props.onRefresh} pending={props.loading}>
              {text("새로고침", "Refresh")}
            </Button>
            <Button
              variant="primary"
              onClick={(event) => {
                addReturnRef.current = event.currentTarget
                props.onOpenAdd?.(event.currentTarget)
              }}
            >
              {text("Skill 추가", "Add Skill")}
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl">
          <CapabilityTabs active="skills" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <section aria-labelledby="skill-filter-title" className="border-b border-stone-200 pb-5">
          <h2 id="skill-filter-title" className="sr-only">
            {text("Skill 필터", "Skill filters")}
          </h2>
          <div className="grid gap-3 md:grid-cols-[minmax(15rem,1fr)_12rem_12rem_auto] md:items-end">
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>{text("검색", "Search")}</span>
              <input
                aria-label={text("Skill 검색", "Search Skills")}
                value={props.search}
                onChange={(event) => props.onSearchChange(event.target.value)}
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
                placeholder={text("이름 또는 설명", "Name or description")}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>{text("출처", "Source")}</span>
              <select
                value={props.sourceKind}
                onChange={(event) => props.onSourceKindChange(event.target.value as SourceFilter)}
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
              >
                <option value="">{text("전체", "All")}</option>
                <option value="builtin">{text("기본 제공", "Built in")}</option>
                <option value="local">{text("로컬", "Local")}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>{text("실행 상태", "Runtime status")}</span>
              <select
                value={props.runtimeStatus}
                onChange={(event) =>
                  props.onRuntimeStatusChange(event.target.value as RuntimeFilter)
                }
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
              >
                <option value="">{text("전체", "All")}</option>
                <option value="active">{text("활성", "Active")}</option>
                <option value="inactive">{text("비활성", "Inactive")}</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-stone-800">
              <input
                type="checkbox"
                checked={props.boundOnly}
                onChange={(event) => props.onBoundOnlyChange(event.target.checked)}
                className="h-5 w-5 accent-stone-900"
              />
              <span>{text("연결된 Skill만", "Bound only")}</span>
            </label>
          </div>
        </section>

        {props.error ? (
          <div className="mt-5">
            <UserRecoveryNotice
              projection={props.error}
              subject="skills"
              text={text}
              onAction={props.error.action === "refresh_state" ? props.onRefresh : undefined}
            />
          </div>
        ) : null}
        {props.loading && props.items.length === 0 ? (
          <div
            className="mt-6 grid gap-3"
            aria-label={text("Skill 목록 불러오는 중", "Loading Skill list")}
          >
            <Skeleton
              width="100%"
              height="88px"
              label={text("Skill 불러오는 중", "Loading Skill")}
            />
            <Skeleton
              width="100%"
              height="88px"
              label={text("Skill 불러오는 중", "Loading Skill")}
            />
          </div>
        ) : null}
        {!props.loading && !props.error && props.items.length === 0 ? (
          <InlineNotice
            tone="info"
            title={text("표시할 Skill이 없습니다", "No Skills found")}
            className="mt-5"
          >
            {text("필터를 바꾸거나 새로고침해 주세요.", "Change the filters or refresh.")}
          </InlineNotice>
        ) : null}

        <section aria-label={text("Skill 목록", "Skill list")} className="mt-6 grid gap-3">
          {props.items.map((item) => (
            <button
              key={item.skillRef}
              type="button"
              data-skill-ref={item.skillRef}
              onClick={(event) => {
                detailReturnRef.current = event.currentTarget
                props.onSelect(item.skillRef, event.currentTarget)
              }}
              className="min-h-[76px] rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white px-4 py-3 text-left hover:border-stone-400 focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
            >
              <span className="flex flex-wrap items-start justify-between gap-3">
                <span>
                  <span className="block font-semibold text-stone-950">{item.displayName}</span>
                  <span className="mt-1 block text-sm leading-5 text-stone-600">
                    {item.description || text("설명이 없습니다.", "No description.")}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {item.sourceKind === "builtin" ? (
                    <StatusLabel>{text("기본 제공", "Built in")}</StatusLabel>
                  ) : null}
                  {item.risk === "safe" ? (
                    <StatusLabel tone="success">{text("안전", "Safe")}</StatusLabel>
                  ) : null}
                  {item.sourceKind === "builtin" ? (
                    <StatusLabel>{text("읽기 전용", "Read only")}</StatusLabel>
                  ) : null}
                  <StatusLabel tone={statusTone(item.runtimeStatus)}>
                    {item.runtimeStatus}
                  </StatusLabel>
                  <StatusLabel>
                    {text(`${item.bindingCount}개 에이전트 연결`, `${item.bindingCount} agents`)}
                  </StatusLabel>
                </span>
              </span>
            </button>
          ))}
        </section>
        {props.nextCursor ? (
          <div className="mt-5 flex justify-center">
            <Button onClick={props.onLoadMore} pending={props.loadingMore}>
              {text("더 보기", "Load more")}
            </Button>
          </div>
        ) : null}
      </div>

      <SkillDetailDrawer
        item={selectedDetail}
        flow={
          props.detailFlow ??
          initialSkillDetailFlow({
            displayName: selectedDetail?.displayName ?? "",
            description: selectedDetail?.description ?? "",
          })
        }
        bindingFlow={
          props.bindingFlow ??
          initialSkillBindingFlow(
            selectedDetail?.bindings.boundAgents.map((agent) => agent.agentRef) ?? [],
          )
        }
        deleteFlow={props.deleteFlow ?? { state: "idle", reasonCode: null, agentNames: [] }}
        returnFocusRef={detailReturnRef}
        onEdit={props.onEditDetail ?? (() => undefined)}
        onDraftChange={props.onDetailDraftChange ?? (() => undefined)}
        onSave={props.onSaveDetail ?? (() => undefined)}
        onCancelEdit={props.onCancelDetailEdit ?? (() => undefined)}
        onToggleStatus={props.onToggleDetailStatus ?? (() => undefined)}
        onEditBindings={props.onEditBindings ?? (() => undefined)}
        onToggleBinding={props.onToggleBinding ?? (() => undefined)}
        onSaveBindings={props.onSaveBindings ?? (() => undefined)}
        onCancelBindings={props.onCancelBindings ?? (() => undefined)}
        onStartDelete={props.onStartDelete ?? (() => undefined)}
        onConfirmDelete={props.onConfirmDelete ?? (() => undefined)}
        onCancelDelete={props.onCancelDelete ?? (() => undefined)}
        onClose={props.onCloseDetail}
      />
      <SkillAddDrawer
        open={props.addOpen ?? false}
        flow={props.addFlow ?? initialSkillAddFlow()}
        returnFocusRef={addReturnRef}
        onDraftChange={props.onAddDraftChange ?? (() => undefined)}
        onValidate={props.onValidateAdd ?? (() => undefined)}
        onSave={props.onSaveAdd ?? (() => undefined)}
        onClose={props.onCloseAdd ?? (() => undefined)}
      />
    </div>
  )
}

export function SkillCatalogPage() {
  const [items, setItems] = useState<SkillCatalogProjection[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [sourceKind, setSourceKind] = useState<SourceFilter>("")
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeFilter>("")
  const [boundOnly, setBoundOnly] = useState(false)
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<UserRecoveryProjection | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [addFlow, setAddFlow] = useState<SkillAddFlow>(initialSkillAddFlow)
  const [detailFlow, setDetailFlow] = useState<SkillDetailFlow>(() =>
    initialSkillDetailFlow({ displayName: "", description: "" }),
  )
  const [detailProjection, setDetailProjection] = useState<SkillDetailResponse | null>(null)
  const [bindingFlow, setBindingFlow] = useState<SkillBindingFlow>(() =>
    initialSkillBindingFlow([]),
  )
  const [deleteFlow, setDeleteFlow] = useState<{
    state: "idle" | "confirming" | "deleting" | "failed"
    reasonCode: string | null
    agentNames: string[]
  }>({ state: "idle", reasonCode: null, agentNames: [] })
  const requestSequenceRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const addControllerRef = useRef<AbortController | null>(null)
  const detailControllerRef = useRef<AbortController | null>(null)

  const loadPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const requestSequence = ++requestSequenceRef.current
      append ? setLoadingMore(true) : setLoading(true)
      setError(null)
      try {
        const response: SkillCatalogPageResponse = await api.skillCatalog(
          {
            limit: 50,
            ...(cursor ? { cursor } : {}),
            ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
            ...(sourceKind ? { sourceKind } : {}),
            ...(runtimeStatus ? { runtimeStatus } : {}),
            boundOnly,
          },
          controller.signal,
        )
        if (requestSequence !== requestSequenceRef.current) return
        setItems((current) => (append ? mergeBySkillRef(current, response.items) : response.items))
        setNextCursor(response.nextCursor)
        setCatalogRevision(response.revision)
        return response
      } catch (cause) {
        if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return
        setError(projectUserRecovery(cause, "read"))
        if (!append) {
          setItems([])
          setNextCursor(null)
        }
        return null
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [boundOnly, deferredSearch, runtimeStatus, sourceKind],
  )

  useEffect(() => {
    void refreshRevision
    void loadPage(null, false)
    return () => {
      controllerRef.current?.abort()
      addControllerRef.current?.abort()
      detailControllerRef.current?.abort()
    }
  }, [loadPage, refreshRevision])

  const transitionAdd = useCallback((event: Parameters<typeof reduceSkillAddFlow>[1]) => {
    setAddFlow((current) => reduceSkillAddFlow(current, event))
  }, [])

  const validateAdd = useCallback(async () => {
    const draft = addFlow.draft
    transitionAdd({ type: "validate" })
    addControllerRef.current?.abort()
    const controller = new AbortController()
    addControllerRef.current = controller
    try {
      const result = await api.validateSkillSource(
        {
          displayName: draft.displayName,
          sourceKind: draft.sourceKind,
          ...(draft.sourceKind === "local" ? { requestedPath: draft.requestedPath ?? "" } : {}),
        },
        controller.signal,
      )
      if (!controller.signal.aborted)
        transitionAdd({
          type: "validation_completed",
          ready: result.ready,
          reasonCodes: result.reasonCodes,
        })
    } catch {
      if (!controller.signal.aborted)
        transitionAdd({
          type: "validation_completed",
          ready: false,
          reasonCodes: ["skill_source_validation_failed"],
        })
    }
  }, [addFlow.draft, transitionAdd])

  const saveAdd = useCallback(async () => {
    const draft = addFlow.draft
    transitionAdd({ type: "save" })
    addControllerRef.current?.abort()
    const controller = new AbortController()
    addControllerRef.current = controller
    try {
      const request = createSkillMutationRequest({
        draft,
        revision: catalogRevision,
        now: Date.now(),
        randomId: () => globalThis.crypto.randomUUID(),
      })
      const receipt = await api.createSkill(request, controller.signal)
      if (controller.signal.aborted) return
      if (receipt.state === "active") {
        transitionAdd({ type: "save_completed", active: true })
        setAddOpen(false)
        setAddFlow(initialSkillAddFlow())
        setRefreshRevision((value) => value + 1)
        return
      }
      transitionAdd({
        type: "save_completed",
        active: false,
        reasonCode: receipt.reasonCode ?? "skill_create_failed",
      })
      if (
        [
          "mutation_revision_conflict",
          "mutation_nonce_replayed",
          "mutation_expired",
          "persisted_revision_mismatch",
        ].includes(receipt.reasonCode ?? "")
      ) {
        setRefreshRevision((value) => value + 1)
      }
    } catch {
      if (!controller.signal.aborted)
        transitionAdd({ type: "save_completed", active: false, reasonCode: "skill_create_failed" })
    }
  }, [addFlow.draft, catalogRevision, transitionAdd])

  const selectedListItem = items.find((item) => item.skillRef === selectedRef) ?? null
  const selectedItem = detailProjection
  const transitionDetail = (event: Parameters<typeof reduceSkillDetailFlow>[1]) =>
    setDetailFlow((current) => reduceSkillDetailFlow(current, event))
  const transitionBinding = (event: Parameters<typeof reduceSkillBindingFlow>[1]) =>
    setBindingFlow((current) => reduceSkillBindingFlow(current, event))

  const openDetail = async (skillRef: string) => {
    const listItem = items.find((item) => item.skillRef === skillRef)
    if (!listItem) return
    const fallback: SkillDetailResponse = {
      ...listItem,
      bindings: { boundAgents: [], availableAgents: [] },
    }
    setSelectedRef(skillRef)
    setDetailProjection(fallback)
    setDetailFlow(
      initialSkillDetailFlow({
        displayName: listItem.displayName,
        description: listItem.description,
      }),
    )
    setBindingFlow(initialSkillBindingFlow([]))
    setDeleteFlow({ state: "idle", reasonCode: null, agentNames: [] })
    detailControllerRef.current?.abort()
    const controller = new AbortController()
    detailControllerRef.current = controller
    try {
      const projection = await api.skillDetail(skillRef, controller.signal)
      if (controller.signal.aborted) return
      setDetailProjection(projection)
      setDetailFlow(
        initialSkillDetailFlow({
          displayName: projection.displayName,
          description: projection.description,
        }),
      )
      setBindingFlow(
        initialSkillBindingFlow(projection.bindings.boundAgents.map((agent) => agent.agentRef)),
      )
    } catch (cause) {
      if (!controller.signal.aborted) setError(projectUserRecovery(cause, "read"))
    }
  }

  const submitDetailChange = async (
    change: import("../contracts/skills").SkillUpdateRequest["change"],
  ) => {
    if (!selectedItem) return
    const expected = {
      displayName: (change.displayName ?? selectedItem.displayName).trim(),
      description: (change.description ?? selectedItem.description).trim(),
      runtimeStatus: change.runtimeStatus ?? selectedItem.runtimeStatus,
    }
    transitionDetail({ type: "save" })
    detailControllerRef.current?.abort()
    const controller = new AbortController()
    detailControllerRef.current = controller
    try {
      const request = createSkillUpdateRequest({
        change,
        revision: catalogRevision,
        now: Date.now(),
        randomId: () => globalThis.crypto.randomUUID(),
      })
      const receipt = await api.updateSkill(selectedItem.skillRef, request, controller.signal)
      if (controller.signal.aborted) return
      if (receipt.state !== "active") {
        transitionDetail({
          type: "save_failed",
          reasonCode: receipt.reasonCode ?? "skill_update_failed",
        })
        if (
          [
            "mutation_revision_conflict",
            "mutation_nonce_replayed",
            "mutation_expired",
            "persisted_revision_mismatch",
          ].includes(receipt.reasonCode ?? "")
        )
          setRefreshRevision((value) => value + 1)
        return
      }
      const projection = await api.skillDetail(selectedItem.skillRef, controller.signal)
      const verified =
        projection.revision === receipt.revision &&
        projection.displayName === expected.displayName &&
        projection.description === expected.description &&
        projection.runtimeStatus === expected.runtimeStatus
      if (!verified) {
        transitionDetail({ type: "save_failed", reasonCode: "skill_projection_not_verified" })
        return
      }
      setDetailProjection(projection)
      setBindingFlow(
        initialSkillBindingFlow(projection.bindings.boundAgents.map((agent) => agent.agentRef)),
      )
      const page = await loadPage(null, false)
      if (controller.signal.aborted) return
      transitionDetail({
        type: "save_succeeded",
        projection: { displayName: projection.displayName, description: projection.description },
      })
      if (!page?.items.some((item) => item.skillRef === selectedItem.skillRef)) setSelectedRef(null)
    } catch {
      if (!controller.signal.aborted)
        transitionDetail({ type: "save_failed", reasonCode: "skill_update_failed" })
    }
  }

  const saveBindings = async () => {
    if (!selectedItem) return
    const persisted = new Set(bindingFlow.persistedBoundAgentRefs)
    const draft = new Set(bindingFlow.draftBoundAgentRefs)
    const changes = [
      ...bindingFlow.persistedBoundAgentRefs
        .filter((agentRef) => !draft.has(agentRef))
        .map((agentRef) => ({ agentRef, bound: false })),
      ...bindingFlow.draftBoundAgentRefs
        .filter((agentRef) => !persisted.has(agentRef))
        .map((agentRef) => ({ agentRef, bound: true })),
    ]
    transitionBinding({ type: "save" })
    detailControllerRef.current?.abort()
    const controller = new AbortController()
    detailControllerRef.current = controller
    let revision = catalogRevision
    try {
      for (const change of changes) {
        const request = createSkillBindingRequest({
          bound: change.bound,
          revision,
          now: Date.now(),
          randomId: () => globalThis.crypto.randomUUID(),
        })
        const receipt = await api.updateSkillBinding(
          selectedItem.skillRef,
          change.agentRef,
          request,
          controller.signal,
        )
        if (controller.signal.aborted) return
        if (receipt.state !== "active") {
          transitionBinding({
            type: "failed",
            reasonCode: receipt.reasonCode ?? "skill_binding_failed",
          })
          if (
            [
              "mutation_revision_conflict",
              "mutation_nonce_replayed",
              "mutation_expired",
              "persisted_revision_mismatch",
            ].includes(receipt.reasonCode ?? "")
          )
            setRefreshRevision((value) => value + 1)
          return
        }
        revision = receipt.revision
      }
      const projection = await api.skillDetail(selectedItem.skillRef, controller.signal)
      const expectedRefs = [...draft].sort((left, right) => left.localeCompare(right))
      const actualRefs = projection.bindings.boundAgents
        .map((agent) => agent.agentRef)
        .sort((left, right) => left.localeCompare(right))
      if (projection.revision !== revision || expectedRefs.join("\n") !== actualRefs.join("\n")) {
        transitionBinding({ type: "failed", reasonCode: "skill_projection_not_verified" })
        return
      }
      setDetailProjection(projection)
      transitionBinding({ type: "saved", boundAgentRefs: actualRefs })
      await loadPage(null, false)
    } catch {
      if (!controller.signal.aborted)
        transitionBinding({ type: "failed", reasonCode: "skill_binding_failed" })
    }
  }

  const confirmDelete = async () => {
    if (!selectedItem || selectedItem.bindings.boundAgents.length > 0) return
    setDeleteFlow({ state: "deleting", reasonCode: null, agentNames: [] })
    detailControllerRef.current?.abort()
    const controller = new AbortController()
    detailControllerRef.current = controller
    try {
      const request = createSkillDeleteRequest({
        revision: catalogRevision,
        now: Date.now(),
        randomId: () => globalThis.crypto.randomUUID(),
      })
      const receipt = await api.deleteSkill(selectedItem.skillRef, request, controller.signal)
      if (controller.signal.aborted) return
      if (receipt.state !== "active" || !receipt.deleted) {
        setDeleteFlow({
          state: "failed",
          reasonCode: receipt.reasonCode ?? "skill_delete_failed",
          agentNames: receipt.impact.agentNames,
        })
        if (
          [
            "mutation_revision_conflict",
            "mutation_nonce_replayed",
            "mutation_expired",
            "persisted_revision_mismatch",
          ].includes(receipt.reasonCode ?? "")
        )
          setRefreshRevision((value) => value + 1)
        return
      }
      setSelectedRef(null)
      setDetailProjection(null)
      setDeleteFlow({ state: "idle", reasonCode: null, agentNames: [] })
      await loadPage(null, false)
    } catch {
      if (!controller.signal.aborted)
        setDeleteFlow({ state: "failed", reasonCode: "skill_delete_failed", agentNames: [] })
    }
  }

  const mutationPending =
    detailFlow.state === "saving" ||
    bindingFlow.state === "saving" ||
    deleteFlow.state === "deleting"
  return (
    <SkillCatalogView
      items={items}
      selectedItem={selectedItem}
      loading={loading}
      loadingMore={loadingMore}
      error={error}
      nextCursor={nextCursor}
      search={search}
      sourceKind={sourceKind}
      runtimeStatus={runtimeStatus}
      boundOnly={boundOnly}
      onSearchChange={setSearch}
      onSourceKindChange={setSourceKind}
      onRuntimeStatusChange={setRuntimeStatus}
      onBoundOnlyChange={setBoundOnly}
      onSelect={(skillRef) => {
        void openDetail(skillRef)
      }}
      onCloseDetail={() => {
        if (!mutationPending) {
          detailControllerRef.current?.abort()
          setSelectedRef(null)
          setDetailProjection(null)
        }
      }}
      onRefresh={() => setRefreshRevision((value) => value + 1)}
      onLoadMore={() => {
        if (nextCursor) void loadPage(nextCursor, true)
      }}
      addOpen={addOpen}
      addFlow={addFlow}
      onOpenAdd={() => {
        setSelectedRef(null)
        setDetailProjection(null)
        setAddFlow(initialSkillAddFlow())
        setAddOpen(true)
      }}
      onCloseAdd={() => {
        if (addFlow.state !== "validating" && addFlow.state !== "saving") {
          addControllerRef.current?.abort()
          setAddOpen(false)
          setAddFlow(initialSkillAddFlow())
        }
      }}
      onAddDraftChange={(patch) => transitionAdd({ type: "draft_changed", patch })}
      onValidateAdd={() => {
        void validateAdd()
      }}
      onSaveAdd={() => {
        void saveAdd()
      }}
      detailFlow={detailFlow}
      onEditDetail={() => transitionDetail({ type: "edit" })}
      onDetailDraftChange={(patch) => transitionDetail({ type: "draft_changed", patch })}
      onSaveDetail={() => {
        void submitDetailChange({
          displayName: detailFlow.draft.displayName,
          description: detailFlow.draft.description,
        })
      }}
      onCancelDetailEdit={() => {
        if (selectedItem)
          transitionDetail({
            type: "cancel",
            projection: {
              displayName: selectedItem.displayName,
              description: selectedItem.description,
            },
          })
      }}
      onToggleDetailStatus={() => {
        if (selectedItem)
          void submitDetailChange({
            runtimeStatus: selectedItem.runtimeStatus === "active" ? "inactive" : "active",
          })
      }}
      bindingFlow={bindingFlow}
      deleteFlow={deleteFlow}
      onEditBindings={() => transitionBinding({ type: "edit" })}
      onToggleBinding={(agentRef) => transitionBinding({ type: "toggle", agentRef })}
      onSaveBindings={() => {
        void saveBindings()
      }}
      onCancelBindings={() => transitionBinding({ type: "cancel" })}
      onStartDelete={() => {
        if (selectedItem)
          setDeleteFlow({
            state: "confirming",
            reasonCode: null,
            agentNames: selectedItem.bindings.boundAgents.map((agent) => agent.name),
          })
      }}
      onConfirmDelete={() => {
        void confirmDelete()
      }}
      onCancelDelete={() => setDeleteFlow({ state: "idle", reasonCode: null, agentNames: [] })}
    />
  )
}
