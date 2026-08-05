// biome-ignore lint/style/useImportType: the repository's Vitest JSX transform requires React at runtime.
import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from "react"
import { api } from "../api/client"
import { ResourceReadStatusNotice } from "../components/ResourceReadStatusNotice"
import { CapabilityTabs } from "../components/capabilities/CapabilityTabs"
import { McpBindingEditor } from "../components/capabilities/McpBindingEditor"
import { McpConnectionDrawer } from "../components/capabilities/McpConnectionDrawer"
import { McpLifecycleControls } from "../components/capabilities/McpLifecycleControls"
import { McpRecoveryControls } from "../components/capabilities/McpRecoveryControls"
import { McpToolBrowser } from "../components/capabilities/McpToolBrowser"
import { Button } from "../components/ui/Button"
import { Drawer } from "../components/ui/Drawer"
import { InlineNotice } from "../components/ui/InlineNotice"
import { Skeleton } from "../components/ui/Skeleton"
import { StatusLabel, type StatusTone } from "../components/ui/StatusLabel"
import type {
  McpCatalogDetail,
  McpCatalogPageResponse,
  McpCatalogProjection,
  McpCatalogRuntimeStatus,
  McpMutationReceipt,
  McpTransport,
} from "../contracts/mcp"
import {
  type McpBindingFlow,
  createMcpBindingRequest,
  initialMcpBindingFlow,
  mcpBindingDiff,
  reduceMcpBindingFlow,
} from "../lib/mcp-binding-flow"
import {
  type McpConnectionFlow,
  type McpConnectionFormDraft,
  createMcpMutationRequest,
  createMcpProtectedUpdateRequest,
  initialMcpConnectionFlow,
  normalizeMcpDraft,
  reduceMcpConnectionFlow,
  verifyMcpMutationProjection,
} from "../lib/mcp-connection-flow"
import {
  type McpLifecycleAction,
  type McpLifecycleFlow,
  createMcpDeleteRequest,
  createMcpLifecycleRequest,
  initialMcpLifecycleFlow,
  reduceMcpLifecycleFlow,
  verifyMcpLifecycleProjection,
} from "../lib/mcp-lifecycle-flow"
import {
  type McpRecoveryFlow,
  createMcpRecoveryRequest,
  initialMcpRecoveryFlow,
  reduceMcpRecoveryFlow,
  verifyMcpRecoveryProjection,
} from "../lib/mcp-recovery-flow"
import {
  type ResourceReadState,
  initialResourceReadState,
  reduceResourceReadState,
} from "../lib/resource-read-state"
import { useUiI18n } from "../lib/ui-i18n"
import { projectUserRecovery } from "../lib/user-recovery"

type TransportFilter = McpTransport | ""
type RuntimeFilter = McpCatalogRuntimeStatus | ""

function tone(status: McpCatalogRuntimeStatus): StatusTone {
  return status === "ready"
    ? "success"
    : status === "unavailable"
      ? "danger"
      : status === "not_loaded"
        ? "warning"
        : "neutral"
}
function merge(
  current: readonly McpCatalogProjection[],
  incoming: readonly McpCatalogProjection[],
) {
  const map = new Map(current.map((item) => [item.mcpRef, item]))
  for (const item of incoming) map.set(item.mcpRef, item)
  return [...map.values()]
}
function issueText(code: McpCatalogProjection["issueCode"], language: "ko" | "en") {
  const texts = {
    mcp_inactive: ["설정에서 비활성화되어 있습니다.", "Disabled in configuration."],
    mcp_runtime_not_loaded: [
      "현재 실행 상태를 확인할 수 없습니다.",
      "Runtime status is not available.",
    ],
    mcp_runtime_unavailable: ["연결이 준비되지 않았습니다.", "The connection is not ready."],
    mcp_required_unavailable: [
      "필수 연결이 준비되지 않았습니다.",
      "A required connection is not ready.",
    ],
  } as const
  return code ? texts[code][language === "ko" ? 0 : 1] : ""
}

export interface McpCatalogViewProps {
  items: readonly McpCatalogProjection[]
  selectedItem: McpCatalogDetail | null
  loading: boolean
  loadingMore: boolean
  detailLoading?: boolean
  detailReadState?: ResourceReadState<McpCatalogDetail>
  readState?: ResourceReadState<McpCatalogPageResponse>
  error?: string | null
  nextCursor: string | null
  search: string
  transport: TransportFilter
  runtimeStatus: RuntimeFilter
  boundOnly: boolean
  onSearchChange(value: string): void
  onTransportChange(value: TransportFilter): void
  onRuntimeStatusChange(value: RuntimeFilter): void
  onBoundOnlyChange(value: boolean): void
  onSelect(mcpRef: string, trigger: HTMLElement): void
  onCloseDetail(): void
  onRefreshDetail?(): void
  onRefresh(): void
  onLoadMore(): void
  mutationOpen?: boolean
  mutationFlow?: McpConnectionFlow
  mutationReturnFocusRef?: React.RefObject<HTMLElement | null>
  onOpenCreate?(trigger: HTMLElement): void
  onOpenEdit?(trigger: HTMLElement): void
  onMutationDraftChange?(patch: Partial<McpConnectionFormDraft>): void
  onMutationProbe?(): void
  onMutationSave?(): void
  onCloseMutation?(): void
  bindingFlow?: McpBindingFlow
  onEditBindings?(): void
  onToggleBinding?(agentRef: string): void
  onSaveBindings?(): void
  onCancelBindings?(): void
  lifecycleFlow?: McpLifecycleFlow
  onBeginLifecycle?(action: McpLifecycleAction): void
  onConfirmLifecycle?(): void
  onCancelLifecycle?(): void
  recoveryFlow?: McpRecoveryFlow
  onRecover?(): void
  onCancelRecovery?(): void
}

export function McpCatalogView(props: McpCatalogViewProps) {
  const { language, text } = useUiI18n()
  const returnFocusRef = useRef<HTMLElement>(null)
  const readState =
    props.readState ??
    (props.error
      ? reduceResourceReadState(initialResourceReadState<McpCatalogPageResponse>(), {
          type: "load_failed",
          failure: projectUserRecovery(props.error, "read"),
        })
      : initialResourceReadState<McpCatalogPageResponse>())
  const detailReadState =
    props.detailReadState ??
    (props.selectedItem
      ? {
          status: "ready" as const,
          data: props.selectedItem,
          observedAt: 0,
          failure: null,
        }
      : initialResourceReadState<McpCatalogDetail>())
  const detailVerified = detailReadState.data !== null
  const selectedBindings = props.selectedItem?.bindings ?? { boundAgents: [], availableAgents: [] }
  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-5 pt-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">
              {text("기능 연결", "Capabilities")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-stone-950">MCP</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {text(
                "외부 기능 연결과 사용 가능한 도구 상태를 확인합니다.",
                "Review external connections and available tools.",
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={props.onRefresh} pending={props.loading}>
              {text("새로고침", "Refresh")}
            </Button>
            <Button
              variant="primary"
              onClick={(event) => props.onOpenCreate?.(event.currentTarget)}
            >
              {text("MCP 추가", "Add MCP")}
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl">
          <CapabilityTabs active="mcp" />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <section
          aria-label={text("MCP 필터", "MCP filters")}
          className="grid gap-3 border-b border-stone-200 pb-5 md:grid-cols-[minmax(15rem,1fr)_11rem_12rem_auto] md:items-end"
        >
          <label className="grid gap-1 text-sm font-medium">
            <span>{text("검색", "Search")}</span>
            <input
              aria-label={text("MCP 검색", "Search MCP")}
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder={text("연결 이름", "Connection name")}
              className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            <span>{text("전송 방식", "Transport")}</span>
            <select
              value={props.transport}
              onChange={(event) => props.onTransportChange(event.target.value as TransportFilter)}
              className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3"
            >
              <option value="">{text("전체", "All")}</option>
              <option value="stdio">stdio</option>
              <option value="http">http</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            <span>{text("실행 상태", "Runtime status")}</span>
            <select
              value={props.runtimeStatus}
              onChange={(event) => props.onRuntimeStatusChange(event.target.value as RuntimeFilter)}
              className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3"
            >
              <option value="">{text("전체", "All")}</option>
              <option value="ready">ready</option>
              <option value="unavailable">unavailable</option>
              <option value="inactive">inactive</option>
              <option value="not_loaded">not loaded</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={props.boundOnly}
              onChange={(event) => props.onBoundOnlyChange(event.target.checked)}
              className="h-5 w-5 accent-stone-900"
            />
            {text("연결된 항목만", "Bound only")}
          </label>
        </section>
        {readState.status === "failed" ||
        readState.status === "stale" ||
        (readState.status === "loading" && readState.data !== null) ? (
          <div className="mt-5">
            <ResourceReadStatusNotice
              state={readState}
              subject="capabilities"
              text={text}
              onRefresh={props.onRefresh}
            />
          </div>
        ) : null}
        {props.loading && props.items.length === 0 ? (
          <div
            aria-label={text("MCP 목록 불러오는 중", "Loading MCP list")}
            className="mt-6 grid gap-3"
          >
            <Skeleton width="100%" height="88px" label={text("MCP 불러오는 중", "Loading MCP")} />
          </div>
        ) : null}
        {!props.loading && readState.status !== "failed" && props.items.length === 0 ? (
          <InlineNotice
            tone="info"
            title={text("표시할 MCP 연결이 없습니다", "No MCP connections found")}
            className="mt-5"
          >
            {text("필터를 바꾸거나 새로고침해 주세요.", "Change filters or refresh.")}
          </InlineNotice>
        ) : null}
        <section aria-label={text("MCP 목록", "MCP list")} className="mt-6 grid gap-3">
          {props.items.map((item) => (
            <button
              key={item.mcpRef}
              data-mcp-ref={item.mcpRef}
              type="button"
              onClick={(event) => {
                returnFocusRef.current = event.currentTarget
                props.onSelect(item.mcpRef, event.currentTarget)
              }}
              className="min-h-[76px] rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white px-4 py-3 text-left hover:border-stone-400 focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
            >
              <span className="flex flex-wrap items-start justify-between gap-3">
                <span>
                  <span className="block font-semibold text-stone-950">{item.displayName}</span>
                  <span className="mt-1 block text-sm text-stone-600">
                    {item.transport} · {text(`${item.toolCount}개 도구`, `${item.toolCount} tools`)}{" "}
                    · {text(`${item.bindingCount}개 에이전트 연결`, `${item.bindingCount} agents`)}
                  </span>
                </span>
                <span className="flex gap-2">
                  <StatusLabel>{item.configuredStatus}</StatusLabel>
                  <StatusLabel tone={tone(item.runtimeStatus)}>{item.runtimeStatus}</StatusLabel>
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
      <Drawer
        open={props.selectedItem !== null}
        title={props.selectedItem?.displayName ?? "MCP"}
        onClose={props.onCloseDetail}
        returnFocusRef={returnFocusRef}
      >
        <div className="grid gap-5">
          {detailReadState.status === "failed" ||
          detailReadState.status === "stale" ||
          (detailReadState.status === "loading" && detailReadState.data !== null) ? (
            <ResourceReadStatusNotice
              state={detailReadState}
              subject="capabilities"
              text={text}
              onRefresh={props.onRefreshDetail ?? (() => undefined)}
            />
          ) : null}
          {(detailReadState.status === "loading" && detailReadState.data === null) ||
          props.detailLoading ? (
            <Skeleton
              width="100%"
              height="120px"
              label={text("MCP 상세 불러오는 중", "Loading MCP details")}
            />
          ) : null}
          {props.selectedItem ? (
            <>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-stone-500">{text("전송 방식", "Transport")}</dt>
                  <dd className="mt-1 font-medium">{props.selectedItem.transport}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">{text("실행 상태", "Runtime")}</dt>
                  <dd className="mt-1">
                    <StatusLabel tone={tone(props.selectedItem.runtimeStatus)}>
                      {props.selectedItem.runtimeStatus}
                    </StatusLabel>
                  </dd>
                </div>
              </dl>
              {detailVerified ? (
                <>
                  <McpRecoveryControls
                    issueCode={props.selectedItem.issueCode}
                    issueText={issueText(props.selectedItem.issueCode, language)}
                    flow={props.recoveryFlow ?? initialMcpRecoveryFlow()}
                    onRecover={props.onRecover ?? (() => undefined)}
                    onCancel={props.onCancelRecovery ?? (() => undefined)}
                  />
                  <McpToolBrowser tools={props.selectedItem.tools} />
                  <McpBindingEditor
                    boundAgents={selectedBindings.boundAgents}
                    availableAgents={selectedBindings.availableAgents}
                    flow={
                      props.bindingFlow ??
                      initialMcpBindingFlow(
                        selectedBindings.boundAgents.map((agent) => agent.agentRef),
                      )
                    }
                    onEdit={props.onEditBindings ?? (() => undefined)}
                    onToggle={props.onToggleBinding ?? (() => undefined)}
                    onSave={props.onSaveBindings ?? (() => undefined)}
                    onCancel={props.onCancelBindings ?? (() => undefined)}
                  />
                  <McpLifecycleControls
                    detail={{ ...props.selectedItem, bindings: selectedBindings }}
                    flow={props.lifecycleFlow ?? initialMcpLifecycleFlow()}
                    onBegin={props.onBeginLifecycle ?? (() => undefined)}
                    onConfirm={props.onConfirmLifecycle ?? (() => undefined)}
                    onCancel={props.onCancelLifecycle ?? (() => undefined)}
                  />
                  <div className="flex justify-end border-t border-stone-200 pt-4">
                    <Button
                      variant="primary"
                      onClick={(event) =>
                        props.onOpenEdit?.(returnFocusRef.current ?? event.currentTarget)
                      }
                    >
                      {text("수정", "Edit")}
                    </Button>
                  </div>
                </>
              ) : (
                <InlineNotice
                  tone="info"
                  title={text("상세 정보 확인 필요", "Details need verification")}
                >
                  {text(
                    "목록에서 확인된 기본 정보만 표시합니다. 상세 상태를 새로고침한 뒤 변경하세요.",
                    "Only list-verified information is shown. Refresh details before making changes.",
                  )}
                </InlineNotice>
              )}
            </>
          ) : null}
        </div>
      </Drawer>
      <McpConnectionDrawer
        open={props.mutationOpen ?? false}
        flow={props.mutationFlow ?? initialMcpConnectionFlow()}
        returnFocusRef={props.mutationReturnFocusRef ?? returnFocusRef}
        onDraftChange={props.onMutationDraftChange ?? (() => undefined)}
        onProbe={props.onMutationProbe ?? (() => undefined)}
        onSave={props.onMutationSave ?? (() => undefined)}
        onClose={props.onCloseMutation ?? (() => undefined)}
      />
    </div>
  )
}

export function McpCatalogPage() {
  const [readState, setReadState] =
    useState<ResourceReadState<McpCatalogPageResponse>>(initialResourceReadState)
  const [items, setItems] = useState<McpCatalogProjection[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [transport, setTransport] = useState<TransportFilter>("")
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeFilter>("")
  const [boundOnly, setBoundOnly] = useState(false)
  const [selectedItem, setSelectedItem] = useState<McpCatalogDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detailReadState, setDetailReadState] =
    useState<ResourceReadState<McpCatalogDetail>>(initialResourceReadState)
  const [refresh, setRefresh] = useState(0)
  const [mutationOpen, setMutationOpen] = useState(false)
  const [mutationFlow, setMutationFlow] = useState<McpConnectionFlow>(() =>
    initialMcpConnectionFlow(),
  )
  const [bindingFlow, setBindingFlow] = useState<McpBindingFlow>(() => initialMcpBindingFlow([]))
  const [lifecycleFlow, setLifecycleFlow] = useState<McpLifecycleFlow>(() =>
    initialMcpLifecycleFlow(),
  )
  const [recoveryFlow, setRecoveryFlow] = useState<McpRecoveryFlow>(() => initialMcpRecoveryFlow())

  const listController = useRef<AbortController | null>(null)
  const detailController = useRef<AbortController | null>(null)
  const mutationController = useRef<AbortController | null>(null)
  const bindingController = useRef<AbortController | null>(null)
  const lifecycleController = useRef<AbortController | null>(null)
  const recoveryController = useRef<AbortController | null>(null)
  const mutationReturnFocusRef = useRef<HTMLElement | null>(null)
  const listSequence = useRef(0)
  const detailSequence = useRef(0)
  const mutationSequence = useRef(0)
  const bindingSequence = useRef(0)
  const lifecycleSequence = useRef(0)
  const recoverySequence = useRef(0)

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      listController.current?.abort()
      const controller = new AbortController()
      listController.current = controller
      const sequence = ++listSequence.current
      append ? setLoadingMore(true) : setLoading(true)
      if (!append)
        setReadState((current) => reduceResourceReadState(current, { type: "load_started" }))
      try {
        const response: McpCatalogPageResponse = await api.mcpCatalog(
          {
            limit: 50,
            ...(cursor ? { cursor } : {}),
            ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
            ...(transport ? { transport } : {}),
            ...(runtimeStatus ? { runtimeStatus } : {}),
            boundOnly,
          },
          controller.signal,
        )
        if (controller.signal.aborted || sequence !== listSequence.current) return null
        setItems((current) => (append ? merge(current, response.items) : response.items))
        setNextCursor(response.nextCursor)
        setCatalogRevision(response.revision)
        if (!append)
          setReadState((current) =>
            reduceResourceReadState(current, {
              type: "load_succeeded",
              data: response,
              observedAt: response.observedAt,
            }),
          )
        return response
      } catch (cause) {
        if (!controller.signal.aborted && sequence === listSequence.current) {
          if (!append)
            setReadState((current) =>
              reduceResourceReadState(current, {
                type: "load_failed",
                failure: projectUserRecovery(cause, "read"),
              }),
            )
        }
        return null
      } finally {
        if (sequence === listSequence.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [boundOnly, deferredSearch, runtimeStatus, transport],
  )

  useEffect(() => {
    void refresh
    void load(null, false)
    return () => {
      listController.current?.abort()
      detailController.current?.abort()
      mutationController.current?.abort()
      bindingController.current?.abort()
      lifecycleController.current?.abort()
      recoveryController.current?.abort()
    }
  }, [load, refresh])

  const loadDetail = async (mcpRef: string, reset: boolean) => {
    if (reset) setDetailReadState(initialResourceReadState())
    setDetailReadState((current) => reduceResourceReadState(current, { type: "load_started" }))
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    const sequence = ++detailSequence.current
    try {
      const detail = await api.mcpCatalogDetail(mcpRef, controller.signal)
      if (controller.signal.aborted || sequence !== detailSequence.current) return
      setSelectedItem(detail)
      setDetailReadState((current) =>
        reduceResourceReadState(current, {
          type: "load_succeeded",
          data: detail,
          observedAt: readState.observedAt ?? 0,
        }),
      )
      setBindingFlow(
        initialMcpBindingFlow(detail.bindings?.boundAgents.map((agent) => agent.agentRef) ?? []),
      )
    } catch (cause) {
      if (controller.signal.aborted || sequence !== detailSequence.current) return
      setDetailReadState((current) =>
        reduceResourceReadState(current, {
          type: "load_failed",
          failure: projectUserRecovery(cause, "read"),
        }),
      )
    }
  }

  const select = async (mcpRef: string) => {
    const row = items.find((item) => item.mcpRef === mcpRef)
    if (!row) return
    setSelectedItem({ ...row, tools: [], bindings: { boundAgents: [], availableAgents: [] } })
    setBindingFlow(initialMcpBindingFlow([]))
    setLifecycleFlow(initialMcpLifecycleFlow())
    recoveryController.current?.abort()
    recoverySequence.current += 1
    setRecoveryFlow(initialMcpRecoveryFlow())
    await loadDetail(mcpRef, true)
  }

  const transitionMutation = useCallback((event: Parameters<typeof reduceMcpConnectionFlow>[1]) => {
    setMutationFlow((current) => reduceMcpConnectionFlow(current, event))
  }, [])

  const openCreate = (trigger: HTMLElement) => {
    mutationController.current?.abort()
    mutationReturnFocusRef.current = trigger
    setMutationFlow(initialMcpConnectionFlow())
    setMutationOpen(true)
  }

  const openEdit = (trigger: HTMLElement) => {
    if (!selectedItem) return
    mutationController.current?.abort()
    mutationReturnFocusRef.current = trigger
    setMutationFlow(
      initialMcpConnectionFlow({
        mode: "edit",
        mcpRef: selectedItem.mcpRef,
        displayName: selectedItem.displayName,
        required: selectedItem.required,
        transport: selectedItem.transport,
      }),
    )
    setSelectedItem(null)
    setMutationOpen(true)
  }

  const probeMutation = async () => {
    const snapshot = mutationFlow
    const sequence = ++mutationSequence.current
    transitionMutation({ type: "probe", sequence })
    mutationController.current?.abort()
    const controller = new AbortController()
    mutationController.current = controller
    try {
      const savedConnectionRef =
        snapshot.mode === "edit" && !snapshot.draft.replaceConnection ? snapshot.mcpRef : null
      const receipt = savedConnectionRef
        ? await api.probeExistingMcp(savedConnectionRef, controller.signal)
        : await api.probeMcpDraft(normalizeMcpDraft(snapshot.draft), controller.signal)
      if (!controller.signal.aborted)
        transitionMutation({
          type: "probe_completed",
          sequence,
          ready: receipt.ready,
          reasonCode: receipt.reasonCode ?? undefined,
        })
    } catch {
      if (!controller.signal.aborted)
        transitionMutation({
          type: "probe_completed",
          sequence,
          ready: false,
          reasonCode: "mcp_connection_probe_failed",
        })
    }
  }

  const saveMutation = async () => {
    const snapshot = mutationFlow
    const sequence = ++mutationSequence.current
    transitionMutation({ type: "save", sequence })
    mutationController.current?.abort()
    const controller = new AbortController()
    mutationController.current = controller
    try {
      const randomId = () => globalThis.crypto.randomUUID()
      let receipt: McpMutationReceipt
      if (snapshot.mode === "create") {
        receipt = await api.createMcp(
          createMcpMutationRequest({
            draft: snapshot.draft,
            revision: catalogRevision,
            now: Date.now(),
            randomId,
          }),
          controller.signal,
        )
      } else {
        if (!snapshot.mcpRef) throw new Error("mcp_ref_not_found")
        receipt = await api.updateMcp(
          snapshot.mcpRef,
          createMcpProtectedUpdateRequest({
            draft: snapshot.draft,
            revision: catalogRevision,
            now: Date.now(),
            randomId,
          }),
          controller.signal,
        )
      }
      if (controller.signal.aborted) return
      if (receipt.state !== "active" || !receipt.mcpRef) {
        transitionMutation({
          type: "save_completed",
          sequence,
          active: false,
          reasonCode: receipt.reasonCode ?? "mcp_mutation_failed",
        })
        if (
          [
            "mutation_revision_conflict",
            "mutation_nonce_replayed",
            "mutation_expired",
            "capability_revision_conflict",
          ].includes(receipt.reasonCode ?? "")
        )
          void load(null, false)
        return
      }
      transitionMutation({ type: "save_completed", sequence, active: true })
      const [latest, detail] = await Promise.all([
        api.mcpCatalog({ limit: 100 }, controller.signal),
        api.mcpCatalogDetail(receipt.mcpRef, controller.signal),
      ])
      if (controller.signal.aborted) return
      const verified = verifyMcpMutationProjection({
        receipt,
        catalog: latest,
        detail,
      })
      transitionMutation({
        type: "verification_completed",
        sequence,
        verified,
        reasonCode: verified ? undefined : "mcp_projection_not_verified",
      })
      setItems(latest.items)
      setNextCursor(latest.nextCursor)
      setCatalogRevision(latest.revision)
      if (verified) {
        setSelectedItem(detail)
        setMutationOpen(false)
        setMutationFlow(initialMcpConnectionFlow())
      }
    } catch {
      if (!controller.signal.aborted) {
        setMutationFlow((current) =>
          current.state === "verifying"
            ? reduceMcpConnectionFlow(current, {
                type: "verification_completed",
                sequence,
                verified: false,
                reasonCode: "mcp_projection_not_verified",
              })
            : reduceMcpConnectionFlow(current, {
                type: "save_completed",
                sequence,
                active: false,
                reasonCode: "mcp_mutation_failed",
              }),
        )
      }
    }
  }

  const closeMutation = () => {
    mutationController.current?.abort()
    mutationSequence.current += 1
    setMutationOpen(false)
    setMutationFlow(initialMcpConnectionFlow())
  }

  const saveBindings = async () => {
    if (!selectedItem) return
    const snapshot = bindingFlow
    const target = selectedItem
    const changes = mcpBindingDiff(snapshot)
    const sequence = ++bindingSequence.current
    setBindingFlow((current) => reduceMcpBindingFlow(current, { type: "save", sequence }))
    bindingController.current?.abort()
    const controller = new AbortController()
    bindingController.current = controller
    let revision = catalogRevision
    let failureReason: string | null = null
    try {
      for (const change of changes) {
        const receipt = await api.updateMcpBinding(
          target.mcpRef,
          change.agentRef,
          createMcpBindingRequest({
            bound: change.bound,
            revision,
            now: Date.now(),
            randomId: () => globalThis.crypto.randomUUID(),
          }),
          controller.signal,
        )
        if (controller.signal.aborted) return
        revision = receipt.revision
        if (receipt.state !== "active") {
          failureReason = receipt.reasonCode ?? "mcp_binding_failed"
          break
        }
      }
      setBindingFlow((current) =>
        reduceMcpBindingFlow(current, { type: "save_completed", sequence, active: true }),
      )
      const detail = await api.mcpCatalogDetail(target.mcpRef, controller.signal)
      if (controller.signal.aborted) return
      const actualRefs = detail.bindings.boundAgents
        .map((agent) => agent.agentRef)
        .sort((left, right) => left.localeCompare(right))
      const expectedRefs = [...snapshot.draftRefs].sort((left, right) => left.localeCompare(right))
      const verified =
        !failureReason &&
        actualRefs.length === expectedRefs.length &&
        actualRefs.every((ref, index) => ref === expectedRefs[index]) &&
        detail.revision === revision
      setBindingFlow((current) =>
        reduceMcpBindingFlow(current, {
          type: "verification_completed",
          sequence,
          verified,
          persistedRefs: actualRefs,
          reasonCode: failureReason ?? (verified ? undefined : "mcp_binding_verify_failed"),
        }),
      )
      setSelectedItem(detail)
      const { tools: _tools, bindings: _bindings, ...projection } = detail
      setItems((current) => merge(current, [projection]))
      setCatalogRevision(Math.max(catalogRevision, detail.revision))
    } catch {
      if (!controller.signal.aborted) {
        setBindingFlow((current) => {
          const verifying =
            current.state === "saving"
              ? reduceMcpBindingFlow(current, { type: "save_completed", sequence, active: true })
              : current
          return reduceMcpBindingFlow(verifying, {
            type: "verification_completed",
            sequence,
            verified: false,
            persistedRefs: verifying.persistedRefs,
            reasonCode: "mcp_binding_failed",
          })
        })
      }
    }
  }

  const runLifecycle = async () => {
    if (!selectedItem || !lifecycleFlow.action) return
    const target = selectedItem
    const action = lifecycleFlow.action
    const sequence = ++lifecycleSequence.current
    setLifecycleFlow((current) => reduceMcpLifecycleFlow(current, { type: "save", sequence }))
    lifecycleController.current?.abort()
    const controller = new AbortController()
    lifecycleController.current = controller
    try {
      const requestInput = {
        revision: Math.max(catalogRevision, target.revision),
        now: Date.now(),
        randomId: () => globalThis.crypto.randomUUID(),
      }
      const receipt =
        action === "delete"
          ? await api.deleteMcp(
              target.mcpRef,
              createMcpDeleteRequest(requestInput),
              controller.signal,
            )
          : await api.updateMcpStatus(
              target.mcpRef,
              createMcpLifecycleRequest({ ...requestInput, action }),
              controller.signal,
            )
      if (controller.signal.aborted) return
      if (receipt.state !== "active") {
        setLifecycleFlow((current) =>
          reduceMcpLifecycleFlow(current, {
            type: "save_completed",
            sequence,
            active: false,
            reasonCode: receipt.reasonCode ?? "mcp_lifecycle_failed",
          }),
        )
        if (
          [
            "mutation_revision_conflict",
            "capability_revision_conflict",
            "mutation_nonce_replayed",
          ].includes(receipt.reasonCode ?? "")
        )
          void load(null, false)
        return
      }
      setLifecycleFlow((current) =>
        reduceMcpLifecycleFlow(current, { type: "save_completed", sequence, active: true }),
      )
      const latest = await api.mcpCatalog({ limit: 100 }, controller.signal)
      const detail =
        action === "delete"
          ? undefined
          : await api.mcpCatalogDetail(target.mcpRef, controller.signal)
      if (controller.signal.aborted) return
      const verified = verifyMcpLifecycleProjection({
        action,
        receipt,
        list: latest,
        ...(detail ? { detail } : {}),
      })
      setLifecycleFlow((current) =>
        reduceMcpLifecycleFlow(current, {
          type: "verification_completed",
          sequence,
          verified,
          reasonCode: verified ? undefined : "mcp_lifecycle_projection_not_verified",
        }),
      )
      setItems(latest.items)
      setNextCursor(latest.nextCursor)
      setCatalogRevision(latest.revision)
      if (verified && action === "delete") setSelectedItem(null)
      else if (detail) {
        setSelectedItem(detail)
        setBindingFlow(
          initialMcpBindingFlow(detail.bindings.boundAgents.map((agent) => agent.agentRef)),
        )
      }
    } catch {
      if (!controller.signal.aborted) {
        setLifecycleFlow((current) => {
          if (current.state === "saving")
            return reduceMcpLifecycleFlow(current, {
              type: "save_completed",
              sequence,
              active: false,
              reasonCode: "mcp_lifecycle_failed",
            })
          return current.state === "verifying"
            ? reduceMcpLifecycleFlow(current, {
                type: "verification_completed",
                sequence,
                verified: false,
                reasonCode: "mcp_lifecycle_projection_not_verified",
              })
            : current
        })
      }
    }
  }

  const runRecovery = async () => {
    if (!selectedItem) return
    const target = selectedItem
    const sequence = ++recoverySequence.current
    setRecoveryFlow((current) => reduceMcpRecoveryFlow(current, { type: "start", sequence }))
    recoveryController.current?.abort()
    const controller = new AbortController()
    recoveryController.current = controller
    try {
      const inspection = await api.probeExistingMcp(target.mcpRef, controller.signal)
      if (controller.signal.aborted || sequence !== recoverySequence.current) return
      setRecoveryFlow((current) =>
        reduceMcpRecoveryFlow(current, {
          type: "inspection_completed",
          sequence,
          ready: inspection.ready,
          reasonCode: inspection.reasonCode ?? undefined,
        }),
      )
      if (!inspection.ready) return
      const receipt = await api.recoverMcp(
        target.mcpRef,
        createMcpRecoveryRequest({
          revision: Math.max(catalogRevision, target.revision),
          now: Date.now(),
          randomId: () => globalThis.crypto.randomUUID(),
        }),
        controller.signal,
      )
      if (controller.signal.aborted || sequence !== recoverySequence.current) return
      setRecoveryFlow((current) =>
        reduceMcpRecoveryFlow(current, {
          type: "recovery_completed",
          sequence,
          active: receipt.state === "active" && receipt.ready,
          reasonCode: receipt.reasonCode ?? undefined,
        }),
      )
      if (receipt.state !== "active" || !receipt.ready) {
        if (
          ["mutation_revision_conflict", "capability_revision_conflict"].includes(
            receipt.reasonCode ?? "",
          )
        )
          void load(null, false)
        return
      }
      const [latest, detail] = await Promise.all([
        api.mcpCatalog({ limit: 100 }, controller.signal),
        api.mcpCatalogDetail(target.mcpRef, controller.signal),
      ])
      if (controller.signal.aborted || sequence !== recoverySequence.current) return
      const verified = verifyMcpRecoveryProjection({ receipt, detail })
      setRecoveryFlow((current) =>
        reduceMcpRecoveryFlow(current, {
          type: "verification_completed",
          sequence,
          verified,
          reasonCode: verified ? undefined : "mcp_recovery_projection_not_verified",
        }),
      )
      setItems(latest.items)
      setNextCursor(latest.nextCursor)
      setCatalogRevision(latest.revision)
      setSelectedItem(detail)
    } catch {
      if (controller.signal.aborted || sequence !== recoverySequence.current) return
      setRecoveryFlow((current) => {
        if (current.state === "inspecting")
          return reduceMcpRecoveryFlow(current, {
            type: "inspection_completed",
            sequence,
            ready: false,
            reasonCode: "mcp_connection_probe_failed",
          })
        if (current.state === "applying")
          return reduceMcpRecoveryFlow(current, {
            type: "recovery_completed",
            sequence,
            active: false,
            reasonCode: "mcp_recovery_failed",
          })
        return current.state === "verifying"
          ? reduceMcpRecoveryFlow(current, {
              type: "verification_completed",
              sequence,
              verified: false,
              reasonCode: "mcp_recovery_projection_not_verified",
            })
          : current
      })
    }
  }

  return (
    <McpCatalogView
      items={items}
      selectedItem={selectedItem}
      loading={loading}
      loadingMore={loadingMore}
      detailReadState={detailReadState}
      readState={readState}
      nextCursor={nextCursor}
      search={search}
      transport={transport}
      runtimeStatus={runtimeStatus}
      boundOnly={boundOnly}
      mutationOpen={mutationOpen}
      mutationFlow={mutationFlow}
      mutationReturnFocusRef={mutationReturnFocusRef}
      bindingFlow={bindingFlow}
      lifecycleFlow={lifecycleFlow}
      recoveryFlow={recoveryFlow}
      onSearchChange={setSearch}
      onTransportChange={setTransport}
      onRuntimeStatusChange={setRuntimeStatus}
      onBoundOnlyChange={setBoundOnly}
      onSelect={(ref) => {
        void select(ref)
      }}
      onCloseDetail={() => {
        detailController.current?.abort()
        detailSequence.current += 1
        bindingController.current?.abort()
        lifecycleController.current?.abort()
        recoveryController.current?.abort()
        lifecycleSequence.current += 1
        recoverySequence.current += 1
        setSelectedItem(null)
        setDetailReadState(initialResourceReadState())
        setRecoveryFlow(initialMcpRecoveryFlow())
      }}
      onRefreshDetail={() => {
        if (selectedItem) void loadDetail(selectedItem.mcpRef, false)
      }}
      onRefresh={() => setRefresh((value) => value + 1)}
      onLoadMore={() => {
        if (nextCursor) void load(nextCursor, true)
      }}
      onOpenCreate={openCreate}
      onOpenEdit={openEdit}
      onMutationDraftChange={(patch) => transitionMutation({ type: "draft_changed", patch })}
      onMutationProbe={() => {
        void probeMutation()
      }}
      onMutationSave={() => {
        void saveMutation()
      }}
      onCloseMutation={closeMutation}
      onEditBindings={() =>
        setBindingFlow((current) => reduceMcpBindingFlow(current, { type: "edit" }))
      }
      onToggleBinding={(agentRef) =>
        setBindingFlow((current) => reduceMcpBindingFlow(current, { type: "toggle", agentRef }))
      }
      onSaveBindings={() => {
        void saveBindings()
      }}
      onCancelBindings={() =>
        setBindingFlow((current) => reduceMcpBindingFlow(current, { type: "cancel" }))
      }
      onBeginLifecycle={(action) =>
        setLifecycleFlow((current) => reduceMcpLifecycleFlow(current, { type: "begin", action }))
      }
      onConfirmLifecycle={() => {
        void runLifecycle()
      }}
      onCancelLifecycle={() =>
        setLifecycleFlow((current) => reduceMcpLifecycleFlow(current, { type: "cancel" }))
      }
      onRecover={() => {
        void runRecovery()
      }}
      onCancelRecovery={() => {
        recoveryController.current?.abort()
        recoverySequence.current += 1
        setRecoveryFlow((current) => reduceMcpRecoveryFlow(current, { type: "cancel" }))
      }}
    />
  )
}
