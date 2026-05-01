import type { FastifyInstance, FastifyReply } from "fastify"
import {
  validateEnterpriseTopology,
  type EnterpriseMetadata,
  type NodeResultOutput,
  type EnterpriseTopology,
} from "../../contracts/enterprise-topology.js"
import {
  applyEnterpriseTopologyGuiCommands,
  createEnterpriseTopologyGuiDraft,
  EnterpriseTopologyGuiOperationError,
  isEnterpriseTopologyGuiCommandKind,
  type EnterpriseTopologyGuiCommand,
  type EnterpriseTopologyGuiDraft,
} from "../../topology/gui-operations.js"
import { compileTopology, type CompileTopologyResult } from "../../topology/compiler.js"
import { buildAgentTeamTopologyImportPreview, type AgentTeamImportMode } from "../../topology/agent-team-import.js"
import {
  createEnterpriseTopologyRegistry,
  type TopologyActivationResult,
} from "../../topology/registry.js"
import {
  normalizeTopologyDocumentFormat,
  parseTopologyImportDocument,
  stringifyTopologyDocument,
  type TopologyImportExportFormat,
} from "../../topology/import-export.js"
import { TOPOLOGY_RELATION_TEMPLATE_CATALOG } from "../../topology/relation-templates.js"
import { TOPOLOGY_TEMPLATE_CATALOG } from "../../topology/templates.js"
import { validateTopology, type TopologyValidationResult } from "../../topology/validator.js"
import { runNodeRuntime } from "../../topology-runtime/node-runtime.js"
import { getTopologyRunTraceProjection, recordTopologyRuntimeExecution } from "../../topology-runtime/trace.js"
import { buildWorkOrder, createWorkOrderRuntimeEnvelope } from "../../topology-runtime/work-order.js"
import {
  getWorkOrderTemplate,
  getWorkOrderTemplateContext,
  type WorkOrderTemplateSimulationMode,
} from "../../topology-runtime/work-order-templates.js"
import type { ToolResult } from "../../tools/types.js"
import { authMiddleware } from "../middleware/auth.js"

interface TopologyImportBody {
  topology?: unknown
  content?: unknown
  format?: unknown
  sourceRef?: unknown
  activate?: unknown
  dryRun?: unknown
  createdBy?: unknown
  importSource?: unknown
}

interface AgentTeamImportPreviewBody {
  topologyId?: unknown
  name?: unknown
  teamImportMode?: unknown
  agents?: unknown
  teams?: unknown
  relationships?: unknown
}

interface TopologyVersionBody {
  topology?: unknown
  createdBy?: unknown
  importSource?: unknown
}

interface RollbackBody {
  targetVersion?: unknown
  version?: unknown
}

interface GuiDraftBody {
  topology?: unknown
  version?: unknown
  reset?: unknown
}

interface GuiDraftOperationsBody {
  operations?: unknown
}

interface GuiDraftRunBody {
  entryNodeId?: unknown
  templateId?: unknown
  contextPresetId?: unknown
  input?: unknown
  advancedInstruction?: unknown
  simulationMode?: unknown
  rootRunId?: unknown
}

const guiDrafts = new Map<string, EnterpriseTopologyGuiDraft>()

export function resetTopologyGuiDraftStoreForTest(): void {
  guiDrafts.clear()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function asVersion(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}

function topologyPayload(body: unknown): unknown {
  if (!isRecord(body)) return body
  return Object.prototype.hasOwnProperty.call(body, "topology") ? body.topology : body
}

function sendValidationError(reply: FastifyReply, reasonCode: string, issues: unknown): FastifyReply {
  return reply.status(400).send({
    ok: false,
    error: reasonCode,
    reasonCode,
    issues,
  })
}

function sendActivationResult(reply: FastifyReply, result: TopologyActivationResult): FastifyReply {
  if (result.ok) {
    return reply.send({
      ok: true,
      activation: result,
    })
  }
  return reply.status(409).send({
    ok: false,
    error: result.reasonCode,
    reasonCode: result.reasonCode,
    activation: result,
  })
}

function parseTopology(body: unknown): { ok: true; topology: EnterpriseTopology } | { ok: false; issues: unknown } {
  const result = validateEnterpriseTopology(topologyPayload(body))
  return result.ok ? { ok: true, topology: result.value } : { ok: false, issues: result.issues }
}

function parseTopologyImport(body: unknown): { ok: true; topology: EnterpriseTopology; format: TopologyImportExportFormat } | { ok: false; issues: unknown; format?: TopologyImportExportFormat } {
  const input = isRecord(body) ? body : { topology: body }
  const result = parseTopologyImportDocument({
    topology: Object.prototype.hasOwnProperty.call(input, "topology") ? input.topology : body,
    content: input.content,
    format: input.format,
    sourceRef: input.sourceRef,
  })
  return result.ok
    ? { ok: true, topology: result.topology, format: result.format }
    : { ok: false, issues: result.issues, ...(result.format ? { format: result.format } : {}) }
}

function asAgentTeamImportMode(value: unknown): AgentTeamImportMode {
  return value === "skip" ? "skip" : "team"
}

function parseGuiDraftCommands(body: GuiDraftOperationsBody | undefined): { ok: true; commands: EnterpriseTopologyGuiCommand[] } | { ok: false; issues: unknown[] } {
  if (!isRecord(body) || !Array.isArray(body.operations)) {
    return {
      ok: false,
      issues: [{
        path: "$.operations",
        reasonCode: "invalid_gui_operation_payload",
        message: "operations must be an array.",
      }],
    }
  }

  const commands: EnterpriseTopologyGuiCommand[] = []
  const issues: unknown[] = []
  body.operations.forEach((operation, index) => {
    if (!isRecord(operation) || typeof operation.op !== "string" || !isEnterpriseTopologyGuiCommandKind(operation.op)) {
      issues.push({
        path: `$.operations[${index}].op`,
        reasonCode: "invalid_gui_operation_payload",
        message: "Unsupported GUI draft operation.",
      })
      return
    }
    commands.push(operation as unknown as EnterpriseTopologyGuiCommand)
  })

  return issues.length > 0 ? { ok: false, issues } : { ok: true, commands }
}

function getTopologyDraftSource(
  topologyId: string,
  body: GuiDraftBody | undefined,
): { ok: true; topology: EnterpriseTopology } | { ok: false; statusCode: number; error: string; issues?: unknown } {
  if (isRecord(body) && Object.prototype.hasOwnProperty.call(body, "topology")) {
    const parsed = parseTopology(body)
    if (!parsed.ok) return { ok: false, statusCode: 400, error: "invalid_enterprise_topology", issues: parsed.issues }
    if (parsed.topology.id !== topologyId) {
      return {
        ok: false,
        statusCode: 400,
        error: "topology_id_mismatch",
        issues: [{
          path: "$.topology.id",
          reasonCode: "topology_id_mismatch",
          message: "Topology id must match route topologyId.",
        }],
      }
    }
    return { ok: true, topology: parsed.topology }
  }

  const registry = createEnterpriseTopologyRegistry()
  const topologyRecord = registry.getTopology(topologyId)
  if (topologyRecord === null) return { ok: false, statusCode: 404, error: "topology_not_found" }
  const version = (isRecord(body) ? asVersion(body.version) : undefined) ?? topologyRecord.activeVersion ?? registry.listVersions(topologyId)[0]?.version
  if (version === undefined) return { ok: false, statusCode: 404, error: "topology_version_not_found" }
  const versionRecord = registry.getVersion(topologyId, version)
  if (versionRecord === null) return { ok: false, statusCode: 404, error: "topology_version_not_found" }
  return { ok: true, topology: versionRecord.topology }
}

function buildWorkOrderPreview(draft: EnterpriseTopologyGuiDraft, result: Extract<CompileTopologyResult, { ok: true }>) {
  const entryNodeId = result.snapshot.runtimeExecutionContext.entryNodeId
  const entryNode = entryNodeId ? result.snapshot.nodeIndex[entryNodeId] : undefined
  if (!entryNode) return null
  return {
    schemaVersion: draft.topology.schemaVersion,
    workOrderId: `preview:${draft.draftId}:${entryNode.id}`,
    topologyRunId: `preview-run:${draft.topologyId}`,
    parentWorkOrderId: null,
    fromNodeId: entryNode.id,
    to: { type: "node", id: entryNode.id },
    objective: `Preview run for ${entryNode.name}`,
    scope: {
      included: [entryNode.id, ...entryNode.childNodeIds],
      excluded: [],
    },
    input: {},
    expectedOutputSchema: {},
    successCriteria: [{
      criterionId: "preview:result-summary",
      description: "Return a structured result summary.",
      required: true,
      validationKind: "manual",
    }],
    permissionScope: {
      allowedToolIds: [...entryNode.allowedToolIds],
      allowedSystemIds: [...entryNode.allowedSystemIds],
      dataDomainIds: [],
      riskLevel: "unknown",
    },
    authorityScope: {
      requiredAuthorityRuleIds: [],
      approvalRequired: false,
    },
    failureReportRequired: entryNode.failurePolicy?.failureReportRequired ?? true,
    delegationPath: [entryNode.id],
    createdAt: draft.updatedAt,
  }
}

function buildCompiledPreviewPayload(draft: EnterpriseTopologyGuiDraft, result: CompileTopologyResult) {
  if (!result.ok) {
    return {
      ok: false,
      topologyId: draft.topologyId,
      draftId: draft.draftId,
      validation: result.validation,
      issues: result.issues,
    }
  }

  const runtimeProfiles = Object.values(result.snapshot.nodeIndex).map((node) => ({
    nodeId: node.id,
    name: node.name,
    nodeType: node.nodeType,
    childNodeIds: [...node.childNodeIds],
    parentNodeIds: [...node.parentNodeIds],
    allowedToolIds: [...node.allowedToolIds],
    allowedSystemIds: [...node.allowedSystemIds],
    failureReportRequired: node.failurePolicy?.failureReportRequired ?? true,
  }))

  return {
    ok: true,
    topologyId: draft.topologyId,
    draftId: draft.draftId,
    compiledTopologySnapshotId: result.snapshot.compiledTopologySnapshotId,
    validation: result.validation,
    delegationTree: result.snapshot.parentChildTree,
    runtimeExecutionContext: result.snapshot.runtimeExecutionContext,
    runtimeProfiles,
    workOrderPreview: buildWorkOrderPreview(draft, result),
  }
}

function updateDraftValidation(draft: EnterpriseTopologyGuiDraft, validation: TopologyValidationResult): EnterpriseTopologyGuiDraft {
  return {
    ...draft,
    validation,
    updatedAt: Date.now(),
  }
}

function asMetadata(value: unknown): EnterpriseMetadata {
  return isRecord(value) ? structuredClone(value) as EnterpriseMetadata : {}
}

function asSimulationMode(value: unknown, fallback: WorkOrderTemplateSimulationMode): WorkOrderTemplateSimulationMode {
  return value === "failure" || value === "success" ? value : fallback
}

function createManualTopologyRunId(topologyId: string, at = Date.now()): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `topology-run:manual:${topologyId}:${at}:${suffix}`
}

function createSatisfiedOutputs(outputIds: string[]): NodeResultOutput[] {
  return outputIds.map((outputId) => ({
    outputId,
    status: "satisfied",
    value: `satisfied:${outputId}`,
  }))
}

function createMissingOutputs(outputIds: string[]): NodeResultOutput[] {
  return outputIds.map((outputId) => ({
    outputId,
    status: "missing",
  }))
}

function createManualTopologyToolDispatcher(simulationMode: WorkOrderTemplateSimulationMode) {
  return {
    async dispatch(name: string): Promise<ToolResult> {
      if (simulationMode === "failure") {
        return {
          success: false,
          output: "",
          error: `manual failure drill for ${name}`,
        }
      }
      return {
        success: true,
        output: `manual tool result for ${name}`,
      }
    },
  }
}

async function runManualGuiDraftTopology(input: {
  draft: EnterpriseTopologyGuiDraft
  body: GuiDraftRunBody | undefined
}): Promise<
  | {
      ok: true
      topologyRunId: string
      entryNodeId: string
      templateId: string
      contextPresetId: string
      simulationMode: WorkOrderTemplateSimulationMode
      topologyRun: NonNullable<ReturnType<typeof getTopologyRunTraceProjection>>
    }
  | {
      ok: false
      statusCode: number
      error: string
      issues?: unknown
    }
> {
  const body = isRecord(input.body) ? input.body : {}
  const compiled = compileTopology(input.draft.topology)
  const updated = updateDraftValidation(input.draft, compiled.validation)
  guiDrafts.set(input.draft.topologyId, updated)
  if (!compiled.ok) {
    return {
      ok: false,
      statusCode: 409,
      error: "topology_compile_blocked",
      issues: compiled.issues,
    }
  }

  const template = getWorkOrderTemplate(asString(body.templateId))
  const contextPreset = getWorkOrderTemplateContext(template, asString(body.contextPresetId))
  const simulationMode = asSimulationMode(body.simulationMode, template.defaultSimulationMode)
  const entryNodeId = asString(body.entryNodeId) ?? compiled.snapshot.runtimeExecutionContext.entryNodeId ?? undefined
  if (entryNodeId === undefined) {
    return {
      ok: false,
      statusCode: 400,
      error: "entry_node_required",
      issues: [{
        path: "$.entryNodeId",
        reasonCode: "entry_node_required",
        message: "Manual topology run requires an entry node.",
      }],
    }
  }

  const compiledNode = compiled.snapshot.nodeIndex[entryNodeId]
  const nodeContract = updated.topology.nodes.find((node) => node.id === entryNodeId)
  if (compiledNode === undefined || nodeContract === undefined) {
    return {
      ok: false,
      statusCode: 400,
      error: "entry_node_not_found",
      issues: [{
        path: "$.entryNodeId",
        reasonCode: "entry_node_not_found",
        message: "Entry node is not present in compiled topology.",
      }],
    }
  }

  const startedAt = Date.now()
  const topologyRunId = createManualTopologyRunId(updated.topologyId, startedAt)
  const requestInput = asMetadata(body.input)
  const advancedInstruction = asString(body.advancedInstruction)
  const workOrder = buildWorkOrder({
    workOrderId: `work-order:${topologyRunId}:${entryNodeId}`,
    topologyRunId,
    parentWorkOrderId: null,
    fromNodeId: entryNodeId,
    to: { type: "node", id: entryNodeId },
    objective: template.objective,
    scope: {
      included: [...template.scopeIncluded, entryNodeId, ...compiledNode.childNodeIds],
      excluded: [...template.scopeExcluded],
    },
    input: {
      ...structuredClone(contextPreset.input),
      ...requestInput,
      templateId: template.templateId,
      contextPresetId: contextPreset.id,
      ...(advancedInstruction !== undefined ? { advancedInstruction } : {}),
    },
    expectedOutputSchema: template.expectedOutputSchema,
    successCriteria: template.successCriteria,
    permissionScope: {
      allowedToolIds: [...compiledNode.allowedToolIds],
      allowedSystemIds: [...compiledNode.allowedSystemIds],
      dataDomainIds: [],
      riskLevel: "unknown",
    },
    authorityScope: {
      requiredAuthorityRuleIds: [],
      approvalRequired: false,
    },
    failureReportRequired: compiledNode.failurePolicy?.failureReportRequired ?? true,
    delegationPath: [entryNodeId],
    createdAt: startedAt,
  })
  const envelope = createWorkOrderRuntimeEnvelope({
    workOrder,
    nodeContractSnapshot: nodeContract,
    compiledTopologySnapshot: compiled.snapshot,
    commandRequestId: `command:${topologyRunId}`,
    subSessionId: `sub-session:${topologyRunId}`,
    parentRunId: asString(body.rootRunId) ?? topologyRunId,
    now: () => Date.now(),
  })
  if (!envelope.ok) {
    return {
      ok: false,
      statusCode: 400,
      error: "work_order_runtime_envelope_invalid",
      issues: envelope.issues,
    }
  }

  const result = await runNodeRuntime({
    envelope: envelope.envelope,
    compiledTopologySnapshot: compiled.snapshot,
    nodeRunId: `node-run:${topologyRunId}:${entryNodeId}`,
    now: () => Date.now(),
    selfExecute: ({ envelope: runtimeEnvelope }) => {
      const outputIds = runtimeEnvelope.expectedOutputs.map((expectedOutput) => expectedOutput.outputId)
      if (simulationMode === "failure") {
        return {
          status: "failed_candidate",
          outputs: createMissingOutputs(outputIds),
          risksOrGaps: ["manual_failure_drill", `template:${template.templateId}`],
          partialResult: {
            contextPresetId: contextPreset.id,
            entryNodeId,
          },
          reasonCode: "manual_topology_run_failed_candidate",
        }
      }
      return {
        status: "completed",
        outputs: createSatisfiedOutputs(outputIds),
        risksOrGaps: [],
        partialResult: {
          contextPresetId: contextPreset.id,
          entryNodeId,
        },
        reasonCode: "manual_topology_run_completed",
      }
    },
    childDelegation: {
      enabled: compiledNode.childNodeIds.length > 0,
      childNodeContractsById: Object.fromEntries(updated.topology.nodes.map((node) => [node.id, node])),
    },
    toolExecution: {
      enabled: compiledNode.allowedToolIds.length > 0,
      dispatcher: createManualTopologyToolDispatcher(simulationMode),
      baseToolContext: {
        sessionId: `session:${topologyRunId}`,
        runId: topologyRunId,
        requestGroupId: `request-group:${topologyRunId}`,
        workDir: process.cwd(),
        userMessage: template.objective,
        source: "webui",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
      toolRequests: compiledNode.allowedToolIds.map((toolId) => ({ toolId })),
      approvalDecisionsByToolId: Object.fromEntries(compiledNode.allowedToolIds.map((toolId) => [toolId, "approved"])) as Record<string, "approved">,
    },
    recovery: {
      enabled: simulationMode === "failure",
      childDelegationAttempted: true,
      toolExecutionAttempted: true,
      retryAttempted: true,
      fallbackAttempted: true,
      partialSuccessChecked: true,
      parentRecoveryPossibleChecked: true,
      recommendedAction: "Review retry and fallback candidates from the topology trace overlay.",
    },
  })

  const persisted = recordTopologyRuntimeExecution({
    result,
    topologyId: updated.topologyId,
    rootRunId: asString(body.rootRunId) ?? topologyRunId,
    metadata: {
      source: "enterprise_topology_gui",
      templateId: template.templateId,
      contextPresetId: contextPreset.id,
      simulationMode,
      entryNodeId,
    },
    now: () => Date.now(),
  })
  const projection = getTopologyRunTraceProjection(persisted.topologyRunId)
  if (projection === null) {
    return {
      ok: false,
      statusCode: 500,
      error: "topology_run_projection_unavailable",
    }
  }

  return {
    ok: true,
    topologyRunId: persisted.topologyRunId,
    entryNodeId,
    templateId: template.templateId,
    contextPresetId: contextPreset.id,
    simulationMode,
    topologyRun: projection,
  }
}

export function registerTopologyRoutes(app: FastifyInstance): void {
  app.get("/api/topology-templates", { preHandler: authMiddleware }, async () => {
    return {
      ok: true,
      catalog: TOPOLOGY_TEMPLATE_CATALOG,
      templates: TOPOLOGY_TEMPLATE_CATALOG.nodePresets,
    }
  })

  app.get("/api/relation-templates", { preHandler: authMiddleware }, async () => {
    return {
      ok: true,
      catalog: TOPOLOGY_RELATION_TEMPLATE_CATALOG,
      templates: TOPOLOGY_RELATION_TEMPLATE_CATALOG.presets,
    }
  })

  app.get("/api/topologies", { preHandler: authMiddleware }, async () => {
    const registry = createEnterpriseTopologyRegistry()
    return {
      ok: true,
      topologies: registry.listTopologies(),
    }
  })

  app.get<{ Params: { topologyId: string } }>(
    "/api/topologies/:topologyId",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const registry = createEnterpriseTopologyRegistry()
      const topology = registry.getTopology(req.params.topologyId)
      if (topology === null) return reply.status(404).send({ ok: false, error: "topology_not_found" })
      return {
        ok: true,
        topology,
        versions: registry.listVersions(req.params.topologyId),
        history: registry.listHistory(req.params.topologyId),
      }
    },
  )

  app.get<{ Params: { topologyId: string } }>(
    "/api/topologies/:topologyId/versions",
    { preHandler: authMiddleware },
    async (req) => {
      const registry = createEnterpriseTopologyRegistry()
      return {
        ok: true,
        versions: registry.listVersions(req.params.topologyId),
      }
    },
  )

  app.post<{ Body: TopologyImportBody }>(
    "/api/topologies/import",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const parsed = parseTopologyImport(req.body)
      if (!parsed.ok) return sendValidationError(reply, "invalid_enterprise_topology", parsed.issues)

      const body = isRecord(req.body) ? req.body : {}
      const validation = validateTopology(parsed.topology)
      if (body.dryRun === true) {
        return {
          ok: true,
          dryRun: true,
          format: parsed.format,
          topology: parsed.topology,
          validation,
          issues: validation.issues,
        }
      }
      const registry = createEnterpriseTopologyRegistry()
      const createdBy = asString(body.createdBy)
      const appended = registry.appendTopologyVersion({
        topology: parsed.topology,
        ...(createdBy !== undefined ? { createdBy } : {}),
        importSource: asString(body.importSource) ?? `api_import:${parsed.format}`,
      })
      if (body.activate === true) {
        const activation = registry.activateTopologyVersion(appended.version.topologyId, appended.version.version)
        if (!activation.ok) {
          return reply.status(409).send({
            ok: false,
            error: activation.reasonCode,
            reasonCode: activation.reasonCode,
            imported: appended,
            activation,
          })
        }
        return reply.status(201).send({ ok: true, imported: appended, activation })
      }
      return reply.status(201).send({
        ok: true,
        format: parsed.format,
        imported: appended,
        validation: appended.validationSnapshot.validation,
        issues: appended.validationSnapshot.validation.issues,
      })
    },
  )

  app.post<{ Body: AgentTeamImportPreviewBody }>(
    "/api/topologies/import/agent-team-preview",
    { preHandler: authMiddleware },
    async (req) => {
      const body = isRecord(req.body) ? req.body : {}
      const topologyId = asString(body.topologyId)
      const name = asString(body.name)
      return buildAgentTeamTopologyImportPreview({
        ...(topologyId !== undefined ? { topologyId } : {}),
        ...(name !== undefined ? { name } : {}),
        teamImportMode: asAgentTeamImportMode(body.teamImportMode),
        ...(Array.isArray(body.agents) ? { agents: body.agents } : {}),
        ...(Array.isArray(body.teams) ? { teams: body.teams } : {}),
        ...(Array.isArray(body.relationships) ? { relationships: body.relationships } : {}),
      })
    },
  )

  app.post<{ Params: { topologyId: string }; Body: TopologyVersionBody }>(
    "/api/topologies/:topologyId/versions",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const parsed = parseTopology(req.body)
      if (!parsed.ok) return sendValidationError(reply, "invalid_enterprise_topology", parsed.issues)
      if (parsed.topology.id !== req.params.topologyId) {
        return sendValidationError(reply, "topology_id_mismatch", [{
          path: "$.id",
          reasonCode: "topology_id_mismatch",
          message: "Topology id must match route topologyId.",
        }])
      }
      const body = isRecord(req.body) ? req.body : {}
      const registry = createEnterpriseTopologyRegistry()
      const createdBy = asString(body.createdBy)
      const importSource = asString(body.importSource)
      const appended = registry.appendTopologyVersion({
        topology: parsed.topology,
        ...(createdBy !== undefined ? { createdBy } : {}),
        ...(importSource !== undefined ? { importSource } : {}),
      })
      return reply.status(201).send({ ok: true, version: appended })
    },
  )

  app.post<{ Params: { topologyId: string }; Body: GuiDraftBody }>(
    "/api/topologies/:topologyId/gui-draft",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const body = isRecord(req.body) ? req.body : {}
      const existing = guiDrafts.get(req.params.topologyId)
      if (existing && body.reset !== true) {
        return { ok: true, draft: existing, reused: true }
      }

      const source = getTopologyDraftSource(req.params.topologyId, body)
      if (!source.ok) {
        const payload = {
          ok: false,
          error: source.error,
          ...(source.issues === undefined ? {} : { issues: source.issues }),
        }
        return reply.status(source.statusCode).send(payload)
      }

      const draft = createEnterpriseTopologyGuiDraft({ topology: source.topology })
      guiDrafts.set(req.params.topologyId, draft)
      return reply.status(201).send({ ok: true, draft, reused: false })
    },
  )

  app.patch<{ Params: { topologyId: string }; Body: GuiDraftOperationsBody }>(
    "/api/topologies/:topologyId/gui-draft/operations",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const draft = guiDrafts.get(req.params.topologyId)
      if (!draft) return reply.status(404).send({ ok: false, error: "gui_draft_not_found" })
      const parsed = parseGuiDraftCommands(req.body)
      if (!parsed.ok) return sendValidationError(reply, "invalid_gui_operation_payload", parsed.issues)

      try {
        const result = applyEnterpriseTopologyGuiCommands(draft, parsed.commands)
        guiDrafts.set(req.params.topologyId, result.draft)
        return {
          ok: true,
          draft: result.draft,
          applied: result.applied,
          structuralChanged: result.structuralChanged,
          layoutChanged: result.layoutChanged,
          validation: result.draft.validation,
        }
      } catch (error) {
        if (error instanceof EnterpriseTopologyGuiOperationError) {
          return reply.status(400).send({
            ok: false,
            error: error.issue.reasonCode,
            issue: error.issue,
          })
        }
        throw error
      }
    },
  )

  app.get<{ Params: { topologyId: string } }>(
    "/api/topologies/:topologyId/gui-draft/issues",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const draft = guiDrafts.get(req.params.topologyId)
      if (!draft) return reply.status(404).send({ ok: false, error: "gui_draft_not_found" })
      return {
        ok: true,
        topologyId: req.params.topologyId,
        draftId: draft.draftId,
        validation: draft.validation,
        issues: draft.validation.issues,
      }
    },
  )

  app.post<{ Params: { topologyId: string } }>(
    "/api/topologies/:topologyId/gui-draft/validate",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const draft = guiDrafts.get(req.params.topologyId)
      if (!draft) return reply.status(404).send({ ok: false, error: "gui_draft_not_found" })
      const validation = validateTopology(draft.topology)
      const updated = updateDraftValidation(draft, validation)
      guiDrafts.set(req.params.topologyId, updated)
      return {
        ok: true,
        topologyId: req.params.topologyId,
        draftId: updated.draftId,
        validation,
        issues: validation.issues,
      }
    },
  )

  app.post<{ Params: { topologyId: string } }>(
    "/api/topologies/:topologyId/gui-draft/compile",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const draft = guiDrafts.get(req.params.topologyId)
      if (!draft) return reply.status(404).send({ ok: false, error: "gui_draft_not_found" })
      const result = compileTopology(draft.topology)
      const updated = updateDraftValidation(draft, result.validation)
      guiDrafts.set(req.params.topologyId, updated)
      return {
        ...buildCompiledPreviewPayload(updated, result),
        ...(result.ok ? { snapshot: result.snapshot } : {}),
      }
    },
  )

  app.get<{ Params: { topologyId: string } }>(
    "/api/topologies/:topologyId/gui-draft/compiled-preview",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const draft = guiDrafts.get(req.params.topologyId)
      if (!draft) return reply.status(404).send({ ok: false, error: "gui_draft_not_found" })
      return buildCompiledPreviewPayload(draft, compileTopology(draft.topology))
    },
  )

  app.post<{ Params: { topologyId: string }; Body: GuiDraftRunBody }>(
    "/api/topologies/:topologyId/gui-draft/run",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const draft = guiDrafts.get(req.params.topologyId)
      if (!draft) return reply.status(404).send({ ok: false, error: "gui_draft_not_found" })
      const result = await runManualGuiDraftTopology({ draft, body: req.body })
      if (!result.ok) {
        return reply.status(result.statusCode).send({
          ok: false,
          error: result.error,
          ...(result.issues === undefined ? {} : { issues: result.issues }),
        })
      }
      return {
        ok: true,
        topologyId: req.params.topologyId,
        draftId: draft.draftId,
        topologyRunId: result.topologyRunId,
        entryNodeId: result.entryNodeId,
        templateId: result.templateId,
        contextPresetId: result.contextPresetId,
        simulationMode: result.simulationMode,
        topologyRun: result.topologyRun,
      }
    },
  )

  app.post<{ Params: { topologyId: string; version: string } }>(
    "/api/topologies/:topologyId/versions/:version/activate",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const version = Number.parseInt(req.params.version, 10)
      if (!Number.isInteger(version) || version <= 0) {
        return sendValidationError(reply, "invalid_topology_version", [{
          path: "$.params.version",
          reasonCode: "invalid_topology_version",
          message: "Topology version must be a positive integer.",
        }])
      }
      const registry = createEnterpriseTopologyRegistry()
      return sendActivationResult(reply, registry.activateTopologyVersion(req.params.topologyId, version))
    },
  )

  app.post<{ Params: { topologyId: string }; Body: RollbackBody }>(
    "/api/topologies/:topologyId/rollback",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const body = isRecord(req.body) ? req.body : {}
      const version = asVersion(body.targetVersion) ?? asVersion(body.version)
      if (version === undefined) {
        return sendValidationError(reply, "invalid_rollback_version", [{
          path: "$.targetVersion",
          reasonCode: "invalid_rollback_version",
          message: "Rollback targetVersion must be a positive integer.",
        }])
      }
      const registry = createEnterpriseTopologyRegistry()
      return sendActivationResult(reply, registry.rollbackTopologyVersion(req.params.topologyId, version))
    },
  )

  app.post<{ Params: { topologyId: string } }>(
    "/api/topologies/:topologyId/archive",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const registry = createEnterpriseTopologyRegistry()
      const history = registry.archiveTopology(req.params.topologyId)
      if (history === null) return reply.status(404).send({ ok: false, error: "topology_not_found" })
      return { ok: true, history }
    },
  )

  app.get<{ Params: { topologyId: string }; Querystring: { version?: string; format?: string } }>(
    "/api/topologies/:topologyId/export",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const version = req.query.version !== undefined ? Number.parseInt(req.query.version, 10) : undefined
      if (req.query.version !== undefined) {
        if (!Number.isInteger(version) || version === undefined || version <= 0) {
          return sendValidationError(reply, "invalid_topology_version", [{
            path: "$.query.version",
            reasonCode: "invalid_topology_version",
            message: "Topology version must be a positive integer.",
          }])
        }
      }
      const registry = createEnterpriseTopologyRegistry()
      const exported = version !== undefined
        ? registry.exportTopology(req.params.topologyId, version)
        : registry.exportTopology(req.params.topologyId)
      if (exported === null) return reply.status(404).send({ ok: false, error: "topology_not_found" })
      const format = normalizeTopologyDocumentFormat(req.query.format)
      const content = stringifyTopologyDocument(exported.version.topology, format)
      return {
        ok: true,
        format,
        filename: `${req.params.topologyId.replace(/[^a-zA-Z0-9_-]+/g, "-")}.${format === "yaml" ? "yaml" : "json"}`,
        content,
        topology: exported.version.topology,
        export: exported,
      }
    },
  )
}
