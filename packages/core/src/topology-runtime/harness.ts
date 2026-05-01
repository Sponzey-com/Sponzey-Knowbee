import type { ChannelSource } from "../channels/contracts.js"
import type {
  EnterpriseMetadata,
  EnterpriseTopology,
  NodeContract,
  NodeResultReport,
} from "../contracts/enterprise-topology.js"
import {
  getFeatureFlag,
  shouldUseNewPath,
  type FeatureFlagMode,
  type RuntimeFeatureFlag,
} from "../runtime/rollout-safety.js"
import {
  createEnterpriseTopologyRegistry,
  type EnterpriseTopologyRegistryStore,
  type TopologyExportEnvelope,
} from "../topology/registry.js"
import {
  buildWorkOrder,
  createWorkOrderRuntimeEnvelope,
} from "./work-order.js"
import {
  runNodeRuntime,
  type NodeRuntimeExecutionResult,
  type NodeRuntimeSelfExecutor,
} from "./node-runtime.js"
import {
  recordTopologyRuntimeExecution,
  type TopologyTracePersistenceResult,
} from "./trace.js"

export const TOPOLOGY_RUNTIME_FEATURE_KEY = "topology_runtime_enabled" as const

export type TopologyRootRunRoutingMode = "route" | "fallback"

export type TopologyRootRunFallbackReasonCode =
  | "feature_flag_off"
  | "non_root_request"
  | "topology_routing_not_opted_in"
  | "topology_not_found"
  | "topology_not_active"
  | "active_topology_not_found"
  | "topology_export_missing"
  | "topology_validation_blocked"
  | "compiled_snapshot_missing"
  | "entry_node_missing"

export type TopologyRootRunRouteReasonCode =
  | "explicit_topology_target"
  | "active_default_workflow_candidate"

export type TopologyRootRunRoutingDecision =
  | {
      mode: "fallback"
      reasonCode: TopologyRootRunFallbackReasonCode
      featureFlagMode: FeatureFlagMode
      explicitTopologyId?: string
      activeTopologyCount?: number
      issues?: string[]
    }
  | {
      mode: "route"
      reasonCode: TopologyRootRunRouteReasonCode
      featureFlagMode: FeatureFlagMode
      topologyId: string
      topologyName: string
      topologyVersion: number
      topologyVersionId: string
      compiledTopologySnapshotId: string
      entryNodeId: string
      explicit: boolean
    }

export type TopologyRootRunExecutionResult =
  | {
      ok: true
      topologyRunId: string
      topologyId: string
      topologyVersion: number
      entryNodeId: string
      entryNodeName: string
      finalAnswer: string
      nodeResultReport: NodeResultReport
      runtimeResult: NodeRuntimeExecutionResult
      persistence: TopologyTracePersistenceResult
    }
  | {
      ok: false
      reasonCode:
        | TopologyRootRunFallbackReasonCode
        | "work_order_envelope_invalid"
        | "topology_runtime_failed"
      fallbackSummary: string
      issues: string[]
      runtimeResult?: NodeRuntimeExecutionResult
      persistence?: TopologyTracePersistenceResult
    }

type TopologyRootRunExecutionFallbackReasonCode =
  Extract<TopologyRootRunExecutionResult, { ok: false }>["reasonCode"]

export interface ResolveTopologyRootRunRoutingInput {
  message: string
  runId: string
  sessionId: string
  source?: ChannelSource
  targetId?: string
  taskProfile?: string
  isRootRequest: boolean
  registry?: EnterpriseTopologyRegistryStore
  featureFlag?: RuntimeFeatureFlag
}

export interface RunTopologyRootRunInput {
  decision: Extract<TopologyRootRunRoutingDecision, { mode: "route" }>
  runId: string
  sessionId: string
  source: ChannelSource
  message: string
  registry?: EnterpriseTopologyRegistryStore
  now?: () => number
  selfExecute?: NodeRuntimeSelfExecutor
}

export function resolveTopologyRootRunRouting(
  input: ResolveTopologyRootRunRoutingInput,
): TopologyRootRunRoutingDecision {
  const featureFlag = input.featureFlag ?? getFeatureFlag(TOPOLOGY_RUNTIME_FEATURE_KEY)
  const featureFlagMode = featureFlag.mode
  const explicitTopologyId = explicitTopologyIdFromInput(input.targetId, input.message)

  if (!shouldUseNewPath(featureFlag)) {
    return {
      mode: "fallback",
      reasonCode: "feature_flag_off",
      featureFlagMode,
      ...(explicitTopologyId !== undefined ? { explicitTopologyId } : {}),
    }
  }

  if (!input.isRootRequest) {
    return {
      mode: "fallback",
      reasonCode: "non_root_request",
      featureFlagMode,
      ...(explicitTopologyId !== undefined ? { explicitTopologyId } : {}),
    }
  }

  const workflowCandidate = explicitTopologyId !== undefined || isWorkflowRoutingCandidate(input.message, input.taskProfile)
  if (!workflowCandidate) {
    return {
      mode: "fallback",
      reasonCode: "topology_routing_not_opted_in",
      featureFlagMode,
    }
  }

  const registry = input.registry ?? createEnterpriseTopologyRegistry()
  const activeTopologies = registry.listTopologies().filter((topology) => (
    topology.status === "active" && topology.activeVersion !== undefined
  ))
  const topologyRecord = explicitTopologyId !== undefined
    ? registry.getTopology(explicitTopologyId)
    : activeTopologies[0] ?? null

  if (topologyRecord === null) {
    return {
      mode: "fallback",
      reasonCode: explicitTopologyId !== undefined ? "topology_not_found" : "active_topology_not_found",
      featureFlagMode,
      ...(explicitTopologyId !== undefined ? { explicitTopologyId } : {}),
      activeTopologyCount: activeTopologies.length,
    }
  }
  if (topologyRecord.status !== "active" || topologyRecord.activeVersion === undefined) {
    return {
      mode: "fallback",
      reasonCode: "topology_not_active",
      featureFlagMode,
      explicitTopologyId: topologyRecord.topologyId,
      activeTopologyCount: activeTopologies.length,
    }
  }

  const exported = registry.exportTopology(topologyRecord.topologyId, topologyRecord.activeVersion)
  return exportedToRoutingDecision({
    exported,
    featureFlagMode,
    explicit: explicitTopologyId !== undefined,
    activeTopologyCount: activeTopologies.length,
  })
}

export async function runTopologyRootRun(
  input: RunTopologyRootRunInput,
): Promise<TopologyRootRunExecutionResult> {
  const registry = input.registry ?? createEnterpriseTopologyRegistry()
  const exported = registry.exportTopology(input.decision.topologyId, input.decision.topologyVersion)
  if (exported === null) {
    return fallbackExecution("topology_export_missing", ["topology_export_missing"])
  }
  if (exported.compiledSnapshot === undefined) {
    return fallbackExecution("compiled_snapshot_missing", ["compiled_snapshot_missing"])
  }

  const now = input.now ?? Date.now
  const topology = exported.version.topology
  const snapshot = exported.compiledSnapshot.snapshot
  const entryNodeId = snapshot.runtimeExecutionContext.entryNodeId
  if (entryNodeId === null) return fallbackExecution("entry_node_missing", ["entry_node_missing"])
  const entryNode = topology.nodes.find((node) => node.id === entryNodeId)
  if (entryNode === undefined) return fallbackExecution("entry_node_missing", [`missing_node:${entryNodeId}`])
  const compiledEntryNode = snapshot.nodeIndex[entryNode.id]
  if (compiledEntryNode === undefined) return fallbackExecution("entry_node_missing", [`missing_compiled_node:${entryNode.id}`])

  const topologyRunId = `topology-run:${input.runId}`
  const workOrder = buildWorkOrder({
    workOrderId: `work-order:${topologyRunId}:${entryNode.id}`,
    topologyRunId,
    parentWorkOrderId: null,
    fromNodeId: entryNode.id,
    to: { type: "node", id: entryNode.id },
    objective: input.message,
    scope: {
      included: [entryNode.id, ...compiledEntryNode.childNodeIds],
      excluded: [],
    },
    input: {
      userRequest: input.message,
      rootRunId: input.runId,
      sessionId: input.sessionId,
      source: input.source,
    },
    expectedOutputSchema: {
      type: "object",
      required: ["answer"],
      properties: {
        answer: { type: "string" },
      },
    },
    successCriteria: [{
      criterionId: `criterion:${topologyRunId}:nobie-final-answer`,
      description: "Produce a result that Nobie can synthesize into the final user answer.",
      required: true,
      validationKind: "manual",
    }],
    permissionScope: {
      allowedToolIds: [...compiledEntryNode.allowedToolIds],
      allowedSystemIds: [...compiledEntryNode.allowedSystemIds],
      dataDomainIds: [],
      riskLevel: "unknown",
    },
    authorityScope: {
      requiredAuthorityRuleIds: [],
      approvalRequired: false,
    },
    failureReportRequired: entryNode.failurePolicy?.failureReportRequired ?? true,
    delegationPath: [entryNode.id],
    createdAt: now(),
  })
  const runtimeEnvelope = createWorkOrderRuntimeEnvelope({
    workOrder,
    nodeContractSnapshot: entryNode,
    compiledTopologySnapshot: snapshot,
    parentRunId: input.runId,
    parentSessionId: input.sessionId,
    commandRequestId: `command:${topologyRunId}:${entryNode.id}`,
    subSessionId: `sub-session:${topologyRunId}:${entryNode.id}`,
    now,
  })
  if (!runtimeEnvelope.ok) {
    return fallbackExecution(
      "work_order_envelope_invalid",
      runtimeEnvelope.issues.map((issue) => issue.reasonCode ?? issue.code),
    )
  }

  const childNodeContractsById = Object.fromEntries(
    topology.nodes.map((node) => [node.id, structuredClone(node)]),
  ) as Record<string, NodeContract>
  const runtimeResult = await runNodeRuntime({
    envelope: runtimeEnvelope.envelope,
    compiledTopologySnapshot: snapshot,
    nodeRunId: `node-run:${topologyRunId}:${entryNode.id}`,
    now,
    component: "topology-root-run",
    ...(input.selfExecute !== undefined ? { selfExecute: input.selfExecute } : {}),
    childDelegation: {
      enabled: true,
      childNodeContractsById,
      recursive: true,
    },
    recovery: {
      enabled: true,
      childDelegationAttempted: true,
      toolExecutionAttempted: true,
      retryAttempted: true,
      fallbackAttempted: true,
      partialSuccessChecked: true,
      parentRecoveryPossibleChecked: true,
      recommendedAction: "Fallback to the existing single Nobie root-run path if topology execution cannot produce a final answer.",
    },
  })
  const persistence = recordTopologyRuntimeExecution({
    result: runtimeResult,
    topologyId: topology.id,
    topologyVersion: exported.version.version,
    topologyVersionId: exported.version.versionId,
    rootRunId: input.runId,
    metadata: {
      source: "root_run_topology_runtime",
      routingReasonCode: input.decision.reasonCode,
      sessionId: input.sessionId,
      sourceChannel: input.source,
    },
    now,
  })

  if (runtimeResult.status !== "completed" && runtimeResult.status !== "partial_success") {
    return {
      ok: false,
      reasonCode: "topology_runtime_failed",
      fallbackSummary: "Topology runtime did not produce a completed result; falling back to the existing root-run path.",
      issues: runtimeResult.nodeResultReport.risksOrGaps,
      runtimeResult,
      persistence,
    }
  }

  return {
    ok: true,
    topologyRunId,
    topologyId: topology.id,
    topologyVersion: exported.version.version,
    entryNodeId: entryNode.id,
    entryNodeName: entryNode.name,
    finalAnswer: buildTopologyFinalAnswer({
      topology,
      entryNode,
      nodeResultReport: runtimeResult.nodeResultReport,
      userRequest: input.message,
    }),
    nodeResultReport: runtimeResult.nodeResultReport,
    runtimeResult,
    persistence,
  }
}

function exportedToRoutingDecision(input: {
  exported: TopologyExportEnvelope | null
  featureFlagMode: FeatureFlagMode
  explicit: boolean
  activeTopologyCount: number
}): TopologyRootRunRoutingDecision {
  if (input.exported === null) {
    return {
      mode: "fallback",
      reasonCode: "topology_export_missing",
      featureFlagMode: input.featureFlagMode,
      activeTopologyCount: input.activeTopologyCount,
    }
  }
  if (!input.exported.validationSnapshot.executable) {
    return {
      mode: "fallback",
      reasonCode: "topology_validation_blocked",
      featureFlagMode: input.featureFlagMode,
      explicitTopologyId: input.exported.topologyRecord.topologyId,
      activeTopologyCount: input.activeTopologyCount,
      issues: input.exported.validationSnapshot.validation.issues
        .filter((issue) => issue.severity === "blocked" || issue.severity === "invalid")
        .map((issue) => issue.reasonCode),
    }
  }
  if (input.exported.compiledSnapshot === undefined) {
    return {
      mode: "fallback",
      reasonCode: "compiled_snapshot_missing",
      featureFlagMode: input.featureFlagMode,
      explicitTopologyId: input.exported.topologyRecord.topologyId,
      activeTopologyCount: input.activeTopologyCount,
    }
  }
  const entryNodeId = input.exported.compiledSnapshot.snapshot.runtimeExecutionContext.entryNodeId
  if (entryNodeId === null) {
    return {
      mode: "fallback",
      reasonCode: "entry_node_missing",
      featureFlagMode: input.featureFlagMode,
      explicitTopologyId: input.exported.topologyRecord.topologyId,
      activeTopologyCount: input.activeTopologyCount,
    }
  }
  return {
    mode: "route",
    reasonCode: input.explicit ? "explicit_topology_target" : "active_default_workflow_candidate",
    featureFlagMode: input.featureFlagMode,
    topologyId: input.exported.topologyRecord.topologyId,
    topologyName: input.exported.topologyRecord.name,
    topologyVersion: input.exported.version.version,
    topologyVersionId: input.exported.version.versionId,
    compiledTopologySnapshotId: input.exported.compiledSnapshot.snapshotId,
    entryNodeId,
    explicit: input.explicit,
  }
}

function explicitTopologyIdFromInput(targetId: string | undefined, message: string): string | undefined {
  const normalizedTarget = normalizeTopologyIdCandidate(targetId)
  if (normalizedTarget !== undefined) return normalizedTarget
  const match = message.match(/\b(?:topology|enterprise-topology):([A-Za-z0-9_.:-]+)/u)
  if (!match?.[0]) return undefined
  return normalizeTopologyIdCandidate(match[0])
}

function normalizeTopologyIdCandidate(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith("topology:")) return trimmed
  if (trimmed.startsWith("enterprise-topology:")) return `topology:${trimmed.slice("enterprise-topology:".length)}`
  return undefined
}

function isWorkflowRoutingCandidate(message: string, taskProfile: string | undefined): boolean {
  if (taskProfile === "operations" || taskProfile === "planning") return true
  return /(?:업무|워크플로|프로세스|승인|위임|담당|조직|workflow|process|approval|delegate|delegation|operations)/iu.test(message)
}

function fallbackExecution(
  reasonCode: TopologyRootRunExecutionFallbackReasonCode,
  issues: string[],
): Extract<TopologyRootRunExecutionResult, { ok: false }> {
  return {
    ok: false,
    reasonCode,
    fallbackSummary: `Topology runtime fallback: ${reasonCode}.`,
    issues,
  }
}

function buildTopologyFinalAnswer(input: {
  topology: EnterpriseTopology
  entryNode: NodeContract
  nodeResultReport: NodeResultReport
  userRequest: string
}): string {
  const outputSummary = summarizeNodeOutputs(input.nodeResultReport)
  const risks = input.nodeResultReport.risksOrGaps.length > 0
    ? `\n\n검토 필요 항목: ${input.nodeResultReport.risksOrGaps.slice(0, 5).join(", ")}`
    : ""
  return [
    `요청을 active Enterprise Topology "${input.topology.name}"의 "${input.entryNode.name}" 노드로 처리했습니다.`,
    `Nobie final answer: ${outputSummary}`,
    `요청: ${input.userRequest}`,
  ].join("\n\n") + risks
}

function summarizeNodeOutputs(report: NodeResultReport): string {
  const values = report.outputs
    .filter((output) => output.status === "satisfied")
    .map((output) => output.value)
  const stringValue = values.find((value) => typeof value === "string")
  if (typeof stringValue === "string" && stringValue.trim()) return stringValue.trim()
  const objectValue = values.find((value): value is EnterpriseMetadata => {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
  })
  if (objectValue !== undefined && typeof objectValue.answer === "string" && objectValue.answer.trim()) {
    return objectValue.answer.trim()
  }
  if (objectValue !== undefined) return JSON.stringify(objectValue).slice(0, 240)
  return report.status
}
