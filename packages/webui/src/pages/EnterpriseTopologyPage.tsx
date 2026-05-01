import { useEffect, useMemo, useState } from "react"
import type { Connection } from "@xyflow/react"
import { api } from "../api/client"
import { buildEnterpriseTopologyCanvasModel } from "../components/topology/EnterpriseTopologyCanvas"
import {
  TopologyAdvancedImportExportPanel,
  buildTopologyDraftExportText,
} from "../components/topology/TopologyAdvancedImportExportPanel"
import {
  createEmptyEnterpriseTopologyForPalette,
  createEnterpriseTopologyPaletteEntity,
  type EnterpriseTopologyPaletteKind,
} from "../components/topology/EnterpriseTopologyPalette"
import type { EnterpriseTopology, EnterpriseTopologyValidationIssue } from "../contracts/enterprise-topology"
import type { EnterpriseRelationType } from "../contracts/enterprise-topology"
import type { AgentTopologyProjection } from "../contracts/topology"
import type { TopologyRelationTemplateCatalog } from "../contracts/relation-templates"
import type { TopologyTemplateCatalog } from "../contracts/topology-templates"
import { useUiI18n } from "../lib/ui-i18n"
import {
  buildEnterpriseTopologyRelationDraft,
  type EnterpriseRelationModeIssue,
  type TopologyRelationModeId,
} from "../components/topology/RelationModeToolbar"
import {
  TopologyRunLauncher,
  buildTopologyRunRequestPayload,
  resolveTopologyRunTargetState,
} from "../components/topology/TopologyRunLauncher"
import type { TopologyRunTraceOverlayInput } from "../components/topology/TopologyRunTraceOverlay"
import { TopologyWorkspaceCanvas } from "../components/topology/TopologyWorkspaceCanvas"
import {
  applyTopologyWorkspaceExecutorMappingToNode,
  type TopologyWorkspaceExecutorMapping,
} from "../components/topology/TopologyWorkspaceInspector"
import { TopologyWorkspaceFirstStartPanel } from "../components/topology/TopologyWorkspaceFirstStart"
import type { TopologyWorkspaceLayer } from "../lib/topology-workspace"
import { TOPOLOGY_WORKSPACE_STARTER_TEMPLATES, buildTopologyWorkspaceStarterDraft, type TopologyWorkspaceStarterTemplateId } from "../lib/topology-workspace-templates"
import type {
  AgentTeamImportMode,
  AgentTeamTopologyImportPreviewResponse,
  EnterpriseTopologyGuiDraftCompiledPreviewResponse,
  EnterpriseTopologyGuiOperation,
  EnterpriseTopologyRunRecord,
  TopologyImportExportFormat,
  WorkOrderTemplateCatalog,
  WorkOrderTemplateSimulationMode,
} from "../lib/enterprise-topology-operations"

const DRAFT_TOPOLOGY_OPTIONS = [
  {
    id: "workspace:draft",
    labelKo: "첫 토폴로지",
    labelEn: "First topology",
  },
]

const DRAFT_VERSION_OPTIONS = [
  {
    id: "draft",
    labelKo: "Draft",
    labelEn: "Draft",
  },
]

export function EnterpriseTopologyPage({
  workspaceLayer = "build",
  onWorkspaceLayerChange,
}: {
  workspaceLayer?: TopologyWorkspaceLayer
  onWorkspaceLayerChange?: (layer: TopologyWorkspaceLayer) => void
} = {}) {
  const { text } = useUiI18n()
  const [topologyId, setTopologyId] = useState(DRAFT_TOPOLOGY_OPTIONS[0].id)
  const [versionId, setVersionId] = useState(DRAFT_VERSION_OPTIONS[0].id)
  const [draftTopology, setDraftTopology] = useState<EnterpriseTopology | null>(null)
  const [templateCatalog, setTemplateCatalog] = useState<TopologyTemplateCatalog | null>(null)
  const [relationCatalog, setRelationCatalog] = useState<TopologyRelationTemplateCatalog | null>(null)
  const [workOrderTemplateCatalog, setWorkOrderTemplateCatalog] = useState<WorkOrderTemplateCatalog | null>(null)
  const [runtimeResources, setRuntimeResources] = useState<AgentTopologyProjection | null>(null)
  const [templateCatalogStatus, setTemplateCatalogStatus] = useState<"loading" | "ready" | "failed">("loading")
  const [relationCatalogStatus, setRelationCatalogStatus] = useState<"loading" | "ready" | "failed">("loading")
  const [workOrderTemplateStatus, setWorkOrderTemplateStatus] = useState<"loading" | "ready" | "failed">("loading")
  const [runtimeResourceStatus, setRuntimeResourceStatus] = useState<"loading" | "ready" | "failed">("loading")
  const [selectedRelationType, setSelectedRelationType] = useState<EnterpriseRelationType>("delegates_to")
  const [selectedRelationMode, setSelectedRelationMode] = useState<TopologyRelationModeId>("smart_connect")
  const [relationIssue, setRelationIssue] = useState<EnterpriseRelationModeIssue | null>(null)
  const [draftIssues, setDraftIssues] = useState<EnterpriseTopologyValidationIssue[]>([])
  const [draftApiStatus, setDraftApiStatus] = useState<"idle" | "syncing" | "ready" | "failed">("idle")
  const [compilePreview, setCompilePreview] =
    useState<EnterpriseTopologyGuiDraftCompiledPreviewResponse | null>(null)
  const [compilePreviewLoading, setCompilePreviewLoading] = useState(false)
  const [importExportFormat, setImportExportFormat] = useState<TopologyImportExportFormat>("json")
  const [importText, setImportText] = useState("")
  const [exportText, setExportText] = useState("")
  const [importExportStatus, setImportExportStatus] = useState("")
  const [teamImportMode, setTeamImportMode] = useState<AgentTeamImportMode>("team")
  const [agentTeamPreview, setAgentTeamPreview] = useState<AgentTeamTopologyImportPreviewResponse | null>(null)
  const [runTargetNodeId, setRunTargetNodeId] = useState<string | null>(null)
  const [selectedWorkOrderTemplateId, setSelectedWorkOrderTemplateId] = useState<string>("")
  const [selectedContextPresetId, setSelectedContextPresetId] = useState<string>("")
  const [simulationMode, setSimulationMode] = useState<WorkOrderTemplateSimulationMode>("success")
  const [advancedInstruction, setAdvancedInstruction] = useState("")
  const [topologyRunLoading, setTopologyRunLoading] = useState(false)
  const [traceOverlay, setTraceOverlay] = useState<TopologyRunTraceOverlayInput | null>(null)
  const [runHistory, setRunHistory] = useState<EnterpriseTopologyRunRecord[]>([])
  const [traceOverlayByRunId, setTraceOverlayByRunId] = useState<Record<string, TopologyRunTraceOverlayInput>>({})
  const model = useMemo(
    () => buildEnterpriseTopologyCanvasModel(draftTopology, draftIssues, relationCatalog),
    [draftTopology, draftIssues, relationCatalog],
  )
  const runTargetState = useMemo(
    () => resolveTopologyRunTargetState({
      topology: draftTopology,
      currentTargetNodeId: runTargetNodeId,
    }),
    [draftTopology, runTargetNodeId],
  )

  useEffect(() => {
    if (runTargetState.source !== "auto_entry" || !runTargetState.targetNodeId) return
    if (runTargetNodeId === runTargetState.targetNodeId) return
    setRunTargetNodeId(runTargetState.targetNodeId)
  }, [runTargetNodeId, runTargetState.source, runTargetState.targetNodeId])

  useEffect(() => {
    let cancelled = false
    api.topologyTemplates()
      .then((response) => {
        if (cancelled) return
        setTemplateCatalog(response.catalog)
        setTemplateCatalogStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setTemplateCatalogStatus("failed")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.workOrderTemplates()
      .then((response) => {
        if (cancelled) return
        setWorkOrderTemplateCatalog(response.catalog)
        const first = response.templates[0]
        if (first) {
          setSelectedWorkOrderTemplateId((current) => current || first.templateId)
          setSelectedContextPresetId((current) => current || first.contextPresets[0]?.id || "")
          setSimulationMode(first.defaultSimulationMode)
        }
        setWorkOrderTemplateStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setWorkOrderTemplateStatus("failed")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.relationTemplates()
      .then((response) => {
        if (cancelled) return
        setRelationCatalog(response.catalog)
        setRelationCatalogStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setRelationCatalogStatus("failed")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.agentTopology()
      .then((response) => {
        if (cancelled) return
        setRuntimeResources(response)
        setRuntimeResourceStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setRuntimeResources(null)
        setRuntimeResourceStatus("failed")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!draftTopology) {
      setDraftIssues([])
      setCompilePreview(null)
      setCompilePreviewLoading(false)
      setDraftApiStatus("idle")
      return () => {
        cancelled = true
      }
    }

    setDraftApiStatus("syncing")
    setCompilePreview(null)
    setCompilePreviewLoading(false)
    api.startEnterpriseTopologyGuiDraft(draftTopology.id, { topology: draftTopology, reset: true })
      .then(() => api.enterpriseTopologyGuiDraftIssues(draftTopology.id))
      .then(async (response) => {
        if (cancelled) return
        setDraftIssues(response.issues)
        setDraftApiStatus("ready")
        if (!response.validation.executable) return
        setCompilePreviewLoading(true)
        try {
          const preview = await api.enterpriseTopologyGuiDraftCompiledPreview(draftTopology.id)
          if (!cancelled) setCompilePreview(preview)
        } catch {
          if (!cancelled) setCompilePreview(null)
        } finally {
          if (!cancelled) setCompilePreviewLoading(false)
        }
      })
      .catch(() => {
        if (cancelled) return
        setDraftIssues([])
        setCompilePreview(null)
        setCompilePreviewLoading(false)
        setDraftApiStatus("failed")
      })

    return () => {
      cancelled = true
    }
  }, [draftTopology])

  const handleCreateEntity = (kind: EnterpriseTopologyPaletteKind, templateId?: string) => {
    setCompilePreview(null)
    setTraceOverlay(null)
    setDraftTopology((current) => {
      const base = current ?? createEmptyEnterpriseTopologyForPalette({
        topologyId,
        name: text("기업 업무 구조 초안", "Enterprise work model draft"),
      })
      return createEnterpriseTopologyPaletteEntity(base, { kind, ...(templateId ? { templateId } : {}) }, templateCatalog).topology
    })
  }

  const handleCreateStarterTopology = (templateId: TopologyWorkspaceStarterTemplateId) => {
    setCompilePreview(null)
    setTraceOverlay(null)
    setRelationIssue(null)
    const starterTemplate = TOPOLOGY_WORKSPACE_STARTER_TEMPLATES.find((template) => template.id === templateId)
    const starter = buildTopologyWorkspaceStarterDraft(templateId, {
      topologyId,
      name: text("첫 토폴로지", "First topology"),
      now: Date.now(),
    })
    if (starterTemplate) {
      const workOrderTemplate = workOrderTemplateCatalog?.templates.find((template) =>
        template.templateId === starterTemplate.defaultWorkOrderTemplateId
      )
      setSelectedWorkOrderTemplateId(starterTemplate.defaultWorkOrderTemplateId)
      setSelectedContextPresetId(starterTemplate.defaultContextPresetId)
      setSimulationMode(workOrderTemplate?.defaultSimulationMode ?? starterTemplate.defaultSimulationMode)
    }
    setDraftTopology(starter)
    setRunTargetNodeId(starter.nodes[0]?.id ?? null)
  }

  const handleCreateRelation = (connection: Connection, relationMode: TopologyRelationModeId) => {
    if (!connection.source || !connection.target) return
    setCompilePreview(null)
    setTraceOverlay(null)
    setDraftTopology((current) => {
      const base = current ?? createEmptyEnterpriseTopologyForPalette({
        topologyId,
        name: text("기업 업무 구조 초안", "Enterprise work model draft"),
      })
      const result = buildEnterpriseTopologyRelationDraft({
        topology: base,
        sourceNodeId: connection.source!,
        targetNodeId: connection.target!,
        relationMode,
        catalog: relationCatalog,
      })
      if (!result.ok) {
        setRelationIssue(result.issue)
        return base
      }
      setRelationIssue(null)
      return result.topology
    })
  }

  const handleValidateDraft = async () => {
    if (!draftTopology) return
    setDraftApiStatus("syncing")
    setCompilePreview(null)
    try {
      await api.startEnterpriseTopologyGuiDraft(draftTopology.id, { topology: draftTopology, reset: true })
      const response = await api.validateEnterpriseTopologyGuiDraft(draftTopology.id)
      setDraftIssues(response.issues)
      setDraftApiStatus("ready")
    } catch {
      setDraftApiStatus("failed")
    }
  }

  const handleCompileDraft = async () => {
    if (!draftTopology) return
    setDraftApiStatus("syncing")
    setCompilePreviewLoading(true)
    try {
      await api.startEnterpriseTopologyGuiDraft(draftTopology.id, { topology: draftTopology, reset: true })
      const response = await api.compileEnterpriseTopologyGuiDraft(draftTopology.id)
      setDraftIssues(response.validation.issues)
      setCompilePreview(response)
      setDraftApiStatus("ready")
    } catch {
      setCompilePreview(null)
      setDraftApiStatus("failed")
    } finally {
      setCompilePreviewLoading(false)
    }
  }

  const handleApplyQuickFix = async (operations: EnterpriseTopologyGuiOperation[]) => {
    if (!draftTopology || operations.length === 0) return
    setDraftApiStatus("syncing")
    setCompilePreview(null)
    try {
      let response
      try {
        response = await api.patchEnterpriseTopologyGuiDraftOperations(draftTopology.id, { operations })
      } catch {
        await api.startEnterpriseTopologyGuiDraft(draftTopology.id, { topology: draftTopology, reset: true })
        response = await api.patchEnterpriseTopologyGuiDraftOperations(draftTopology.id, { operations })
      }
      setDraftTopology(response.draft.topology)
      setDraftIssues(response.validation.issues)
      setDraftApiStatus("ready")
    } catch {
      setDraftApiStatus("failed")
    }
  }

  const handleSelectImportExportFormat = (format: TopologyImportExportFormat) => {
    setImportExportFormat(format)
    setExportText((current) => current ? buildTopologyDraftExportText(draftTopology, format) : current)
  }

  const handleSelectTeamImportMode = (mode: AgentTeamImportMode) => {
    setTeamImportMode(mode)
    setAgentTeamPreview(null)
  }

  const handleExportDraft = () => {
    const textValue = buildTopologyDraftExportText(draftTopology, importExportFormat)
    setExportText(textValue)
    setImportText(textValue)
    setImportExportStatus(textValue
      ? text("초안 내용을 만들었습니다.", "Draft export is ready.")
      : text("내보낼 초안이 없습니다.", "No draft to export."))
  }

  const handleImportDraft = async () => {
    if (!importText.trim()) return
    setImportExportStatus(text("가져오는 중", "Importing"))
    setCompilePreview(null)
    setTraceOverlay(null)
    try {
      const response = await api.importEnterpriseTopology({
        content: importText,
        format: importExportFormat,
        dryRun: true,
        importSource: "enterprise_builder_advanced",
      })
      if (response.topology) {
        setDraftTopology(response.topology)
        setTopologyId(response.topology.id)
      }
      setDraftIssues(response.issues)
      setImportExportStatus(text("가져온 초안을 검증했습니다.", "Imported draft was validated."))
    } catch {
      setImportExportStatus(text("가져오기 실패", "Import failed"))
    }
  }

  const handlePreviewAgentTeamImport = async () => {
    setImportExportStatus(text("이전 미리보기 생성 중", "Building migration preview"))
    try {
      const response = await api.previewAgentTeamTopologyImport({
        topologyId,
        name: text("Agent/Team 이전 초안", "Agent/Team migration draft"),
        teamImportMode,
      })
      setAgentTeamPreview(response)
      setDraftIssues(response.validation.issues)
      setImportExportStatus(text("이전 미리보기를 만들었습니다.", "Migration preview is ready."))
    } catch {
      setAgentTeamPreview(null)
      setImportExportStatus(text("이전 미리보기 실패", "Migration preview failed"))
    }
  }

  const handleApplyAgentTeamImport = () => {
    if (!agentTeamPreview) return
    setCompilePreview(null)
    setTraceOverlay(null)
    setDraftTopology(agentTeamPreview.topology)
    setDraftIssues(agentTeamPreview.validation.issues)
    setTopologyId(agentTeamPreview.topology.id)
    setImportExportStatus(text("이전 초안을 적용했습니다.", "Migration draft applied."))
  }

  const handleSelectWorkOrderTemplate = (templateId: string) => {
    const template = workOrderTemplateCatalog?.templates.find((item) => item.templateId === templateId)
    setSelectedWorkOrderTemplateId(templateId)
    setSelectedContextPresetId(template?.contextPresets[0]?.id ?? "")
    setSimulationMode(template?.defaultSimulationMode ?? "success")
  }

  const handleRunStartNodeQuickFix = () => {
    const firstEntryNodeId = runTargetState.entryNodeIds[0]
    if (firstEntryNodeId) {
      setRunTargetNodeId(firstEntryNodeId)
      return
    }
    handleCreateEntity("task")
  }

  const handleExecutorMappingChange = (nodeId: string, mapping: TopologyWorkspaceExecutorMapping) => {
    setCompilePreview(null)
    setTraceOverlay(null)
    setDraftTopology((current) => {
      if (!current) return current
      const now = Date.now()
      return {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId ? applyTopologyWorkspaceExecutorMappingToNode(node, mapping) : node
        ),
        updatedAt: now,
      }
    })
  }

  const handleSelectRunHistory = (topologyRunId: string) => {
    const overlay = traceOverlayByRunId[topologyRunId]
    if (overlay) setTraceOverlay(overlay)
  }

  const handleRunTopology = async () => {
    const entryNodeId = runTargetState.targetNodeId ?? runTargetNodeId
    if (!draftTopology || !entryNodeId || !selectedWorkOrderTemplateId) return
    setTopologyRunLoading(true)
    try {
      await api.startEnterpriseTopologyGuiDraft(draftTopology.id, { topology: draftTopology, reset: true })
      const run = await api.runEnterpriseTopologyGuiDraft(draftTopology.id, buildTopologyRunRequestPayload({
        entryNodeId,
        templateId: selectedWorkOrderTemplateId,
        ...(selectedContextPresetId ? { contextPresetId: selectedContextPresetId } : {}),
        simulationMode,
        advancedInstruction,
      }))
      const [trace, failures] = await Promise.all([
        api.topologyRunTrace(run.topologyRunId),
        api.topologyRunFailureReports(run.topologyRunId),
      ])
      const overlay = {
        run: run.topologyRun.run,
        traceEvents: trace.traceEvents,
        toolCalls: run.topologyRun.toolCalls,
        failureReports: failures.failureReports,
        observedEdges: run.topologyRun.observedEdges,
        gapFindings: run.topologyRun.gapFindings,
      }
      setTraceOverlay(overlay)
      setTraceOverlayByRunId((current) => ({ ...current, [run.topologyRunId]: overlay }))
      setRunHistory((current) => [
        run.topologyRun.run,
        ...current.filter((item) => item.topologyRunId !== run.topologyRunId),
      ].slice(0, 5))
    } catch {
      setTraceOverlay(null)
    } finally {
      setTopologyRunLoading(false)
    }
  }

  const validationBadgeLabel =
    draftApiStatus === "syncing"
      ? text("동기화 중", "Syncing")
      : draftApiStatus === "failed"
        ? text("검증 연결 실패", "Validation offline")
        : !draftTopology
          ? text("검증 대기", "Ready for validation")
          : draftIssues.length === 0
            ? text("검증 통과", "Validation passed")
            : text(`${draftIssues.length}개 이슈`, `${draftIssues.length} issues`)

  return (
    <div className="flex h-full flex-col bg-stone-100 text-stone-950">
      <header className="shrink-0 border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
              {text("토폴로지", "Topology")}
            </div>
            <h1 className="mt-1 text-xl font-semibold">
              {text("업무 흐름 만들기", "Build work flows")}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleValidateDraft}
              disabled={!draftTopology || draftApiStatus === "syncing"}
              className="h-8 rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {text("검증", "Validate")}
            </button>
            <button
              type="button"
              onClick={handleCompileDraft}
              disabled={!draftTopology || compilePreviewLoading}
              className="h-8 rounded-md bg-stone-900 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {text("실행 준비", "Prepare run")}
            </button>
            <label className="grid gap-0.5 text-[11px] font-semibold text-stone-500">
              <span>{text("토폴로지", "Topology")}</span>
              <select
                value={topologyId}
                onChange={(event) => setTopologyId(event.currentTarget.value)}
                className="h-8 min-w-48 rounded-md border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-800"
              >
                {DRAFT_TOPOLOGY_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {text(item.labelKo, item.labelEn)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-0.5 text-[11px] font-semibold text-stone-500">
              <span>{text("버전", "Version")}</span>
              <select
                value={versionId}
                onChange={(event) => setVersionId(event.currentTarget.value)}
                className="h-8 min-w-24 rounded-md border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-800"
              >
                {DRAFT_VERSION_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {text(item.labelKo, item.labelEn)}
                  </option>
                ))}
              </select>
            </label>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
              {text("만들기", "Build")}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              templateCatalogStatus === "ready"
                ? "bg-emerald-100 text-emerald-800"
                : templateCatalogStatus === "failed"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-stone-100 text-stone-700"
            }`}>
              {templateCatalogStatus === "ready"
                ? text("템플릿 준비", "Templates ready")
                : templateCatalogStatus === "failed"
                  ? text("기본 템플릿", "Default templates")
                  : text("템플릿 로딩", "Loading templates")}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              relationCatalogStatus === "ready"
                ? "bg-emerald-100 text-emerald-800"
                : relationCatalogStatus === "failed"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-stone-100 text-stone-700"
            }`}>
              {relationCatalogStatus === "ready"
                ? text("관계 규칙 준비", "Relation rules ready")
                : relationCatalogStatus === "failed"
                  ? text("기본 관계 규칙", "Default relation rules")
                  : text("관계 규칙 로딩", "Loading relation rules")}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              workOrderTemplateStatus === "ready"
                ? "bg-emerald-100 text-emerald-800"
                : workOrderTemplateStatus === "failed"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-stone-100 text-stone-700"
            }`}>
              {workOrderTemplateStatus === "ready"
                ? text("실행 템플릿 준비", "Run templates ready")
                : workOrderTemplateStatus === "failed"
                  ? text("실행 템플릿 실패", "Run templates failed")
                : text("실행 템플릿 로딩", "Loading run templates")}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              runtimeResourceStatus === "ready"
                ? "bg-emerald-100 text-emerald-800"
                : runtimeResourceStatus === "failed"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-stone-100 text-stone-700"
            }`}>
              {runtimeResourceStatus === "ready"
                ? text("리소스 준비", "Resources ready")
                : runtimeResourceStatus === "failed"
                  ? text("리소스 실패", "Resources failed")
                  : text("리소스 로딩", "Loading resources")}
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 font-semibold text-stone-700">
            {model.nodes.length} {text("업무 항목", "items")}
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 font-semibold text-stone-700">
            {model.edges.length} {text("연결", "connections")}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${
            draftApiStatus === "failed"
              ? "bg-amber-100 text-amber-800"
              : draftIssues.length === 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
          }`}>
            {validationBadgeLabel}
          </span>
        </div>
      </header>

      <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <TopologyRunLauncher
          templates={workOrderTemplateCatalog?.templates ?? []}
          selectedTemplateId={selectedWorkOrderTemplateId}
          selectedContextPresetId={selectedContextPresetId}
          simulationMode={simulationMode}
          advancedInstruction={advancedInstruction}
          runTargetNodeId={runTargetNodeId}
          targetState={runTargetState}
          recentRuns={runHistory}
          selectedRunId={traceOverlay?.run?.topologyRunId ?? null}
          traceOverlay={traceOverlay}
          loading={topologyRunLoading}
          onSelectTemplate={handleSelectWorkOrderTemplate}
          onSelectContextPreset={setSelectedContextPresetId}
          onSelectSimulationMode={setSimulationMode}
          onAdvancedInstructionChange={setAdvancedInstruction}
          onRun={handleRunTopology}
          onSelectRunHistory={handleSelectRunHistory}
          onTraceLayerRequest={() => onWorkspaceLayerChange?.("trace")}
          onStartNodeQuickFix={handleRunStartNodeQuickFix}
        />
      </div>

      {workspaceLayer === "build" && (!draftTopology || model.nodes.length === 0) ? (
        <TopologyWorkspaceFirstStartPanel
          templates={TOPOLOGY_WORKSPACE_STARTER_TEMPLATES}
          onSelectTemplate={handleCreateStarterTopology}
          onAddFirstStep={() => handleCreateEntity("work_node")}
        />
      ) : null}

      <TopologyAdvancedImportExportPanel
        topology={draftTopology}
        format={importExportFormat}
        importText={importText}
        exportText={exportText}
        status={importExportStatus}
        issues={draftIssues}
        agentTeamPreview={agentTeamPreview}
        teamImportMode={teamImportMode}
        onFormatChange={handleSelectImportExportFormat}
        onImportTextChange={setImportText}
        onExportDraft={handleExportDraft}
        onImportDraft={handleImportDraft}
        onPreviewAgentTeamImport={handlePreviewAgentTeamImport}
        onApplyAgentTeamImport={handleApplyAgentTeamImport}
        onTeamImportModeChange={handleSelectTeamImportMode}
      />

      <TopologyWorkspaceCanvas
        selectedLayer={workspaceLayer}
        topology={draftTopology}
        runtimeResources={runtimeResources}
        validationIssues={draftIssues}
        templateCatalog={templateCatalog}
        onCreateEntity={handleCreateEntity}
        relationCatalog={relationCatalog}
        selectedRelationType={selectedRelationType}
        selectedRelationMode={selectedRelationMode}
        onSelectRelationType={setSelectedRelationType}
        onSelectRelationMode={setSelectedRelationMode}
        relationIssue={relationIssue}
        onCreateRelation={handleCreateRelation}
        compilePreview={compilePreview}
        compilePreviewLoading={compilePreviewLoading}
        onApplyQuickFix={handleApplyQuickFix}
        traceOverlay={traceOverlay}
        runTargetNodeId={runTargetNodeId}
        onRunTargetChange={setRunTargetNodeId}
        onSelectedRunnableTargetChange={setRunTargetNodeId}
        onExecutorMappingChange={handleExecutorMappingChange}
        onRunLayerRequest={() => onWorkspaceLayerChange?.("run")}
        agentTeamPreview={agentTeamPreview}
        teamImportMode={teamImportMode}
        onPreviewAgentTeamImport={handlePreviewAgentTeamImport}
        onApplyAgentTeamImport={handleApplyAgentTeamImport}
        onTeamImportModeChange={handleSelectTeamImportMode}
      />
    </div>
  )
}
