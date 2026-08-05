import { randomUUID } from "node:crypto"
import type { ParentAggregationNextAction } from "../agent/sub-agent-result-review.js"
import { CONTRACT_SCHEMA_VERSION, type JsonValue } from "../contracts/index.js"
import {
  runRequestDiagnosisProviderWithRepair,
  type LlmDiagnosisProvider,
} from "../contracts/llm-diagnosis-provider.js"
import type { LlmDiagnosisSchemaRepairProvider } from "../contracts/llm-diagnosis-schema-repair-provider.js"
import { buildDelegatedExecutionSnapshot } from "../contracts/delegated-execution-snapshot.js"
import { authorizeDiagnosisActionRoute } from "../contracts/diagnosis-action-routing.js"
import type { KnowbeeConfig } from "../config/types.js"
import type { MemoryJournalRepository } from "../memory/journal.js"
import { createAgentHierarchyService, type AgentHierarchyStorage } from "../orchestration/hierarchy.js"
import {
  auditRuntimeWorkHandoffProjection,
} from "../contracts/structured-work-audit.js"
import type { LlmRequestDiagnosisRecord } from "../contracts/work-record.js"
import {
  type CommandRequest,
  type OrchestrationPlan,
  type OrchestrationTask,
  type ResultReport,
  type RuntimeIdentity,
  type StructuredTaskScope,
  type TeamExecutionTaskSnapshot,
  resolveAgentConfigAgentName,
} from "../contracts/sub-agent-orchestration.js"
import { buildAgentPromptBundle } from "../orchestration/prompt-bundle.js"
import { evaluateDelegationEligibility } from "../orchestration/delegation-eligibility.js"
import {
  authorizeDelegationInForest,
  validateDelegationForestSnapshot,
  type DelegationForestSnapshot,
} from "../orchestration/delegation-forest.js"
import {
  buildOrchestrationRegistrySnapshot,
  type AgentRegistryEntry,
} from "../orchestration/registry.js"
import {
  createSubSessionRunner,
  type RunSubSessionInput,
} from "../orchestration/sub-session-runner.js"
import { recordStructuredWorkAuditEventSafely } from "../orchestration/structured-work-audit-ledger.js"
import { recordRuntimeWorkRecordSnapshotSafely } from "../orchestration/work-record-snapshot-ledger.js"
import {
  buildTeamExecutionPlan,
  type TeamExecutionPlanServiceDependencies,
} from "../orchestration/team-execution-plan.js"
import { redactLogText } from "../logger/index.js"
import { loadPromptTemplate } from "../memory/knowbee-md.js"
import type { StartRootRunParams, StartedRootRun } from "./start.js"
import type { RootRun, TaskProfile } from "./types.js"

export type DelegatedTaskDispatchOutcomeStatus =
  | "running"
  | "pending_result"
  | "completed"
  | "failed"
  | "skipped"

export interface DelegatedTaskDispatchLifecycleEntry {
  status: DelegatedTaskDispatchOutcomeStatus
  at: number
  reasonCode?: string
  parentRunId?: string
  selectedExecutorId?: string
  subSessionId?: string
  childRunId?: string
  summary?: string
}

export interface DelegatedTaskDispatchOutcome {
  taskId: string
  subSessionId?: string
  agentId?: string
  agentName?: string
  agentSource?: AgentRegistryEntry["source"]
  topologyId?: string
  topologyExecutorId?: string
  status: DelegatedTaskDispatchOutcomeStatus
  reasonCode?: string
  childRunId?: string
  summary?: string
  parentAggregationNextAction?: ParentAggregationNextAction
  feedbackRequestId?: string
  startedAt?: number
  completedAt?: number
  lifecycle?: DelegatedTaskDispatchLifecycleEntry[]
}

export interface DelegatedTaskDispatchResult {
  attempted: number
  completed: number
  failed: number
  skipped: number
  outcomes: DelegatedTaskDispatchOutcome[]
}

export type DelegatedTaskDispatchOrder =
  | { ok: true; tasks: OrchestrationTask[] }
  | { ok: false; reasonCode: "dependency_missing" | "dependency_cycle" }

export function orderDelegatedTasksForDispatch(
  plan: Pick<OrchestrationPlan, "directKnowbeeTasks" | "delegatedTasks" | "dependencyEdges">,
): DelegatedTaskDispatchOrder {
  const allTasks = [...plan.directKnowbeeTasks, ...plan.delegatedTasks]
  const taskById = new Map(allTasks.map((task) => [task.taskId, task]))
  if (taskById.size !== allTasks.length) return { ok: false, reasonCode: "dependency_cycle" }
  const outgoing = new Map<string, string[]>()
  const indegree = new Map(allTasks.map((task) => [task.taskId, 0]))
  for (const edge of plan.dependencyEdges) {
    if (!taskById.has(edge.fromTaskId) || !taskById.has(edge.toTaskId)) {
      return { ok: false, reasonCode: "dependency_missing" }
    }
    outgoing.set(edge.fromTaskId, [...(outgoing.get(edge.fromTaskId) ?? []), edge.toTaskId])
    indegree.set(edge.toTaskId, (indegree.get(edge.toTaskId) ?? 0) + 1)
  }
  const queue = allTasks
    .filter((task) => indegree.get(task.taskId) === 0)
    .map((task) => task.taskId)
  const ordered: OrchestrationTask[] = []
  while (queue.length > 0) {
    const taskId = queue.shift()
    if (!taskId) break
    const task = taskById.get(taskId)
    if (task) ordered.push(task)
    for (const next of outgoing.get(taskId) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }
  if (ordered.length !== allTasks.length) return { ok: false, reasonCode: "dependency_cycle" }
  const delegatedIds = new Set(plan.delegatedTasks.map((task) => task.taskId))
  return { ok: true, tasks: ordered.filter((task) => delegatedIds.has(task.taskId)) }
}

export interface DelegatedTaskDispatchParams {
  artifactStorage: StartRootRunParams["artifactStorage"]
  memoryJournal: MemoryJournalRepository
  hierarchyStorage: AgentHierarchyStorage
  plan: OrchestrationPlan
  parentRunId: string
  parentAgentName: string
  parentSessionId: string
  parentRequestGroupId: string
  source: StartRootRunParams["source"]
  message: string
  originalRequest?: string
  workDir: string
  controller: AbortController
}

export interface DelegatedTaskDispatchDependencies {
  config: KnowbeeConfig
  startSubAgentRun: (params: StartRootRunParams) => StartedRootRun
  appendParentEvent?: (runId: string, label: string) => void
  updateParentSummary?: (runId: string, summary: string) => RootRun | undefined
  now?: () => number
  idProvider?: () => string
  diagnosisProvider?: LlmDiagnosisProvider
  diagnosisRepairProvider?: LlmDiagnosisSchemaRepairProvider
}

const ROOT_AGENT_ID = "agent:knowbee"

function orchestrationDispatchErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

function orchestrationDispatchReasonDetail(error: unknown): string {
  return orchestrationDispatchErrorMessage(error).trim().replace(/\s+/g, "_").slice(0, 80) || "unknown_error"
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
}

async function resolvePreDispatchRequestDiagnosis(input: {
  dependencies: DelegatedTaskDispatchDependencies
  appendParentEvent: (runId: string, label: string) => void
  parentRunId: string
  parentAgentName: string
  task: OrchestrationTask
  originalRequest: string
}): Promise<LlmRequestDiagnosisRecord | undefined> {
  if (!input.dependencies.diagnosisProvider || !input.dependencies.diagnosisRepairProvider) {
    input.appendParentEvent(
      input.parentRunId,
      `request_diagnosis_unavailable:${input.task.taskId}:provider_missing`,
    )
    return undefined
  }

  try {
    const diagnosisInput = {
      provider: input.dependencies.diagnosisProvider,
      repairProvider: input.dependencies.diagnosisRepairProvider,
      ownerAgentName: input.parentAgentName,
      userRequestSummary: input.originalRequest,
      context: [
        `task_id:${input.task.taskId}`,
        `task_goal:${input.task.scope.goal}`,
        `task_action:${input.task.scope.actionType}`,
        ...input.task.scope.reasonCodes.map((reasonCode) => `reason:${reasonCode}`),
      ],
      constraints: input.task.scope.constraints,
      workId: `work:${input.parentRunId}`,
      stepId: input.task.taskId,
    }
    const result = await runRequestDiagnosisProviderWithRepair(diagnosisInput)

    if (result.status === "valid" && result.target === "request_diagnosis") {
      const route = authorizeDiagnosisActionRoute({
        receipt: result.receipt,
        subjectPayload: {
          ownerAgentName: diagnosisInput.ownerAgentName,
          userRequestSummary: diagnosisInput.userRequestSummary,
          context: diagnosisInput.context,
          constraints: diagnosisInput.constraints,
          workId: diagnosisInput.workId,
          stepId: diagnosisInput.stepId,
        },
        diagnosis: result.diagnosis,
      })
      if (route.routeKind !== "delegation") {
        input.appendParentEvent(
          input.parentRunId,
          `request_diagnosis_unavailable:${input.task.taskId}:route_not_delegation`,
        )
        return undefined
      }
      return result.diagnosis
    }

    input.appendParentEvent(
      input.parentRunId,
      `request_diagnosis_unavailable:${input.task.taskId}:${result.status}`,
    )
    return undefined
  } catch (error) {
    const reason = orchestrationDispatchReasonDetail(error)
    input.appendParentEvent(
      input.parentRunId,
      `request_diagnosis_unavailable:${input.task.taskId}:provider_error:${reason}`,
    )
    return undefined
  }
}

function taskProfileForScope(scope: StructuredTaskScope): TaskProfile {
  const haystack = [
    scope.goal,
    scope.intentType,
    scope.actionType,
    ...scope.constraints,
    ...scope.reasonCodes,
  ].join(" ").toLowerCase()
  if (/(code|coding|develop|implement|bug|test|typescript|javascript|react|개발|구현|버그|테스트)/.test(haystack)) {
    return "coding"
  }
  if (/(review|검토|리뷰)/.test(haystack)) return "review"
  if (/(research|retrieve|search|조사|검색|자료)/.test(haystack)) return "research"
  if (/(plan|planning|계획|설계)/.test(haystack)) return "planning"
  if (/(operate|deploy|release|운영|배포)/.test(haystack)) return "operations"
  return "general_chat"
}

export function buildDelegatedTaskExecutionPrompt(input: {
  renderedPrompt: string
  task: OrchestrationTask
  originalRequest: string
}): string {
  const expectedOutputs = input.task.scope.expectedOutputs
    .map((output) => `- ${output.outputId}: ${output.description}`)
    .join("\n")
  const constraints = input.task.scope.constraints.map((item) => `- ${item}`).join("\n")
  return loadPromptTemplate({
    sourceId: "delegated_task_dispatch_user",
    variables: {
      renderedPrompt: input.renderedPrompt.trim(),
      taskId: input.task.taskId,
      goal: input.task.scope.goal,
      actionType: input.task.scope.actionType,
      originalRequest: input.originalRequest.trim(),
      expectedOutputs: expectedOutputs || "- Complete the delegated scope and report concrete results.",
      constraints: constraints || "- Stay within the delegated scope.",
    },
  }).replace(/\n{3,}/g, "\n\n").trim()
}

function identityFor(input: {
  entityType: RuntimeIdentity["entityType"]
  entityId: string
  ownerType: RuntimeIdentity["owner"]["ownerType"]
  ownerId: string
  parentRunId: string
  parentSessionId: string
  parentRequestId: string
  idempotencyKey: string
}): RuntimeIdentity {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    entityType: input.entityType,
    entityId: input.entityId,
    owner: { ownerType: input.ownerType, ownerId: input.ownerId },
    idempotencyKey: input.idempotencyKey,
    parent: {
      parentRunId: input.parentRunId,
      parentSessionId: input.parentSessionId,
      parentRequestId: input.parentRequestId,
    },
  }
}

function commandRequestFor(input: {
  task: OrchestrationTask
  agent: AgentRegistryEntry
  subSessionId: string
  parentRunId: string
  parentSessionId: string
  parentRequestId: string
}): CommandRequest {
  const topologyAssignment = topologyAssignmentFromAgentId(input.agent)
  const agentName = dispatchAgentName(input.agent)
  return {
    identity: identityFor({
      entityType: "sub_session",
      entityId: input.subSessionId,
      ownerType: "knowbee",
      ownerId: ROOT_AGENT_ID,
      parentRunId: input.parentRunId,
      parentSessionId: input.parentSessionId,
      parentRequestId: input.parentRequestId,
      idempotencyKey: `sub-session:${input.parentRunId}:${input.task.taskId}:${input.agent.agentId}`,
    }),
    commandRequestId: `command:${input.parentRunId}:${input.task.taskId}`,
    parentRunId: input.parentRunId,
    subSessionId: input.subSessionId,
    targetAgentId: input.agent.agentId,
    targetAgentName: agentName,
    targetAgentNameSnapshot: agentName,
    ...(topologyAssignment.topologyId
      ? {
          topologyExecutor: {
            graphExecutionPlanId: topologyAssignment.topologyId,
            ...(topologyAssignment.topologyExecutorId
              ? { executorId: topologyAssignment.topologyExecutorId }
              : {}),
          },
        }
      : {}),
    taskScope: input.task.scope,
    contextPackageIds: [],
    expectedOutputs: input.task.scope.expectedOutputs,
  }
}

function dispatchAgentName(agent: AgentRegistryEntry): string {
  return agent.config.agentName?.trim() || "Unnamed sub-agent"
}

function reportFor(input: {
  command: CommandRequest
  agent: AgentRegistryEntry
  status: ResultReport["status"]
  childRun: RootRun | undefined
  risksOrGaps?: string[]
}): ResultReport {
  const outputStatus =
    input.status === "completed"
      ? "satisfied"
      : input.status === "needs_revision"
        ? "partial"
        : "missing"
  const value: JsonValue = {
    childRunId: input.childRun?.id,
    childStatus: input.childRun?.status,
    summary: input.childRun?.summary ?? "Sub-agent execution did not return a run summary.",
  }
  return {
    identity: identityFor({
      entityType: "sub_session",
      entityId: input.command.subSessionId,
      ownerType: "sub_agent",
      ownerId: input.agent.agentId,
      parentRunId: input.command.parentRunId,
      parentSessionId: input.command.identity.parent?.parentSessionId ?? "",
      parentRequestId: input.command.identity.parent?.parentRequestId ?? input.command.parentRunId,
      idempotencyKey: `result-report:${input.command.parentRunId}:${input.command.subSessionId}`,
    }),
    resultReportId: randomUUID(),
    parentRunId: input.command.parentRunId,
    subSessionId: input.command.subSessionId,
    source: {
      entityType: "sub_agent",
      entityId: input.agent.agentId,
      agentNameSnapshot: resolveAgentConfigAgentName(input.agent.config),
    },
    status: input.status,
    outputs: input.command.expectedOutputs.map((output) => ({
      outputId: output.outputId,
      status: outputStatus,
      value,
    })),
    evidence: input.childRun
      ? [
          {
            evidenceId: randomUUID(),
            kind: "child_run",
            sourceRef: input.childRun.id,
            sourceTimestamp: new Date(input.childRun.updatedAt).toISOString(),
          },
          {
            evidenceId: randomUUID(),
            kind: "summary",
            sourceRef: input.childRun.id,
            sourceTimestamp: new Date(input.childRun.updatedAt).toISOString(),
          },
        ]
      : [],
    artifacts: [],
    risksOrGaps: input.risksOrGaps ?? [],
  }
}

function resultSummary(resultReport: ResultReport | undefined): string | undefined {
  const value = resultReport?.outputs[0]?.value
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const summary = value.summary
  return typeof summary === "string" && summary.trim() ? summary.trim() : undefined
}

function isDelegationDispatchEligible(params: DelegatedTaskDispatchParams): boolean {
  return params.plan.delegatedTasks.some((task) => task.assignedAgentId?.trim() || task.assignedTeamId?.trim())
}

function topologyAssignmentFromAgentId(agent: AgentRegistryEntry): {
  topologyId?: string
  topologyExecutorId?: string
} {
  if (agent.source !== "topology") return {}
  const marker = ":node:"
  const markerIndex = agent.agentId.indexOf(marker)
  if (markerIndex < 0) return {}
  return {
    topologyId: agent.agentId.slice(0, markerIndex),
    topologyExecutorId: `node:${agent.agentId.slice(markerIndex + marker.length)}`,
  }
}

export type DispatchToChildExecutorValidation =
  | {
      ok: true
      reasonCodes: string[]
      selectedExecutorId?: string
    }
  | {
      ok: false
      reasonCode: string
      summary: string
      selectedExecutorId?: string
    }

export function validateDispatchToChildExecutorInput(input: {
  task: OrchestrationTask
  agent: AgentRegistryEntry
}): DispatchToChildExecutorValidation {
  if (input.agent.source !== "topology") {
    const eligibility = evaluateDelegationEligibility(input)
    if (eligibility.state === "rejected") {
      const reasonCode = eligibility.reasonCodes[0] ?? "delegation_policy_rejected"
      return {
        ok: false,
        reasonCode,
        summary: `Sub-agent dispatch was blocked by the current delegation policy (${reasonCode}).`,
        ...(input.task.planningTrace?.selectedExecutorId
          ? { selectedExecutorId: input.task.planningTrace.selectedExecutorId }
          : {}),
      }
    }
    return {
      ok: true,
      reasonCodes: ["registry_executor_selected", ...eligibility.reasonCodes],
    }
  }

  const selectedExecutorId = input.task.planningTrace?.selectedExecutorId?.trim()
  const reasonCodes = new Set([
    ...input.task.scope.reasonCodes,
    ...(input.task.planningTrace?.reasonCodes ?? []),
  ])
  const validatedByDecision =
    reasonCodes.has("execution_decision_selected_executor") ||
    reasonCodes.has("explicit_topology_target")
  if (!validatedByDecision) {
    return {
      ok: false,
      reasonCode: "validated_execution_decision_required",
      summary: "Topology executor dispatch was blocked because no validated executor selection was attached.",
      ...(selectedExecutorId ? { selectedExecutorId } : {}),
    }
  }
  if (!selectedExecutorId) {
    return {
      ok: false,
      reasonCode: "validated_execution_decision_executor_missing",
      summary: "Topology executor dispatch was blocked because the selected executor id is missing.",
    }
  }
  if (selectedExecutorId !== input.agent.agentId) {
    return {
      ok: false,
      reasonCode: "validated_execution_decision_executor_mismatch",
      summary: "Topology executor dispatch was blocked because the selected executor differs from the dispatch target.",
      selectedExecutorId,
    }
  }
  return {
    ok: true,
    reasonCodes: [...reasonCodes].filter((code) => code.trim()),
    selectedExecutorId,
  }
}

export class DispatchToChildExecutor {
  validate(input: {
    task: OrchestrationTask
    agent: AgentRegistryEntry
  }): DispatchToChildExecutorValidation {
    return validateDispatchToChildExecutorInput(input)
  }
}

function teamDispatchBlockReason(task: OrchestrationTask): string | undefined {
  const reasonCodes = new Set([
    ...task.scope.reasonCodes,
    ...(task.planningTrace?.reasonCodes ?? []),
  ])
  if (reasonCodes.has("inferred_team_target_from_capability")) {
    return "inferred_team_target_from_capability_blocked"
  }
  if (reasonCodes.has("inferred_team_target_from_request")) {
    return "inferred_team_target_from_request_blocked"
  }
  if (!reasonCodes.has("explicit_team_target")) {
    return "team_dispatch_requires_explicit_target"
  }
  return undefined
}

function teamTaskOrder(taskKind: TeamExecutionTaskSnapshot["taskKind"]): number {
  if (taskKind === "member") return 0
  if (taskKind === "synthesis") return 1
  if (taskKind === "review") return 2
  return 3
}

function orchestrationTaskFromTeamTask(
  task: TeamExecutionTaskSnapshot,
  parentTask: OrchestrationTask,
): OrchestrationTask {
  return {
    taskId: task.taskId,
    executionKind: task.executionKind,
    scope: task.scope,
    ...(task.assignedAgentId ? { assignedAgentId: task.assignedAgentId } : {}),
    ...(task.assignedTeamId ?? parentTask.assignedTeamId
      ? { assignedTeamId: task.assignedTeamId ?? parentTask.assignedTeamId }
      : {}),
    requiredCapabilities: uniqueStrings([
      ...parentTask.requiredCapabilities,
      ...task.requiredCapabilities,
    ]),
    resourceLockIds: uniqueStrings([
      ...parentTask.resourceLockIds,
      ...task.resourceLockIds,
    ]),
    planningTrace: {
      reasonCodes: uniqueStrings([
        ...(parentTask.planningTrace?.reasonCodes ?? []),
        ...task.reasonCodes,
        "team_execution_task_expanded",
      ]),
      explanation: `Expanded from team task ${parentTask.taskId}.`,
    },
  }
}

export async function dispatchDelegatedSubAgentTasks(
  params: DelegatedTaskDispatchParams,
  dependencies: DelegatedTaskDispatchDependencies,
): Promise<DelegatedTaskDispatchResult> {
  const appendParentEvent = dependencies.appendParentEvent ?? (() => undefined)
  const updateParentSummary = dependencies.updateParentSummary ?? (() => undefined)
  if (!isDelegationDispatchEligible(params)) {
    return { attempted: 0, completed: 0, failed: 0, skipped: 0, outcomes: [] }
  }
  const dispatchOrder = orderDelegatedTasksForDispatch(params.plan)
  if (!dispatchOrder.ok) {
    const failedAt = dependencies.now?.() ?? Date.now()
    return {
      attempted: 0,
      completed: 0,
      failed: 1,
      skipped: 0,
      outcomes: [{
        taskId: params.plan.planId,
        status: "failed",
        reasonCode: dispatchOrder.reasonCode,
        summary: `Workflow dispatch was blocked before execution (${dispatchOrder.reasonCode}).`,
        completedAt: failedAt,
      }],
    }
  }

  const registry = buildOrchestrationRegistrySnapshot({ config: dependencies.config })
  const agentsById = new Map(registry.agents.map((agent) => [agent.agentId, agent]))
  const teams = registry.teams.map((team) => team.config)
  const hierarchy = createAgentHierarchyService({
    config: dependencies.config,
    storage: params.hierarchyStorage,
  })
  let delegationForest: DelegationForestSnapshot | undefined
  let delegationForestIssue: string | undefined
  try {
    const configuredRoot = dependencies.config.orchestration.knowbee
    delegationForest = validateDelegationForestSnapshot({
      rootAgentId: hierarchy.rootAgentId,
      agents: [
        {
          agentId: hierarchy.rootAgentId,
          agentName: configuredRoot
            ? resolveAgentConfigAgentName(configuredRoot)
            : params.parentAgentName,
          agentType: "knowbee",
          status: configuredRoot?.status ?? "enabled",
          ...(configuredRoot?.delegationPolicy
            ? { delegationPolicy: configuredRoot.delegationPolicy }
            : {}),
        },
        ...registry.agents
          .filter((agent) => agent.agentId !== hierarchy.rootAgentId)
          .map((agent) => ({
            agentId: agent.agentId,
            agentName: dispatchAgentName(agent),
            agentType: "sub_agent" as const,
            status: agent.status,
            delegationPolicy: agent.config.delegation,
          })),
      ],
      relationships: hierarchy.list(),
    })
  } catch (error) {
    delegationForestIssue = error instanceof Error ? error.message : "invalid delegation forest"
  }
  const runner = createSubSessionRunner({
    ...(dependencies.now ? { now: dependencies.now } : {}),
    ...(dependencies.idProvider ? { idProvider: dependencies.idProvider } : {}),
    ...(dependencies.diagnosisProvider ? { diagnosisProvider: dependencies.diagnosisProvider } : {}),
    ...(dependencies.diagnosisRepairProvider ? { diagnosisRepairProvider: dependencies.diagnosisRepairProvider } : {}),
  })
  const originalRequest = params.originalRequest?.trim() || params.message
  const outcomes: DelegatedTaskDispatchOutcome[] = []
  let attempted = 0
  const now = dependencies.now ?? (() => Date.now())
  const childDispatch = new DispatchToChildExecutor()

  const dispatchAgentTask = async (
    task: OrchestrationTask,
    agent: AgentRegistryEntry,
  ): Promise<void> => {
    const topologyAssignment = topologyAssignmentFromAgentId(agent)
    const agentName = dispatchAgentName(agent)
    const forestAuthorization = agent.source === "topology"
      ? undefined
      : delegationForest
        ? authorizeDelegationInForest({
            snapshot: delegationForest,
            expectedSnapshotFingerprint: delegationForest.snapshotFingerprint,
            callerAgentId: delegationForest.rootAgentId,
            targetAgentId: agent.agentId,
          })
        : { ok: false as const, reasonCode: "delegation_forest_invalid" as const }
    const validation: DispatchToChildExecutorValidation = forestAuthorization && !forestAuthorization.ok
      ? {
          ok: false,
          reasonCode: forestAuthorization.reasonCode,
          summary: delegationForestIssue
            ? `Sub-agent dispatch was blocked because the delegation forest is invalid (${redactLogText(delegationForestIssue)}).`
            : `Sub-agent dispatch was blocked by the delegation forest policy (${forestAuthorization.reasonCode}).`,
        }
      : childDispatch.validate({ task, agent })
    if (!validation.ok) {
      const failedAt = now()
      attempted += 1
      outcomes.push({
        taskId: task.taskId,
        agentId: agent.agentId,
        agentName,
        agentSource: agent.source,
        ...topologyAssignment,
        status: "failed",
        reasonCode: validation.reasonCode,
        summary: validation.summary,
        completedAt: failedAt,
        lifecycle: [{
          status: "failed",
          at: failedAt,
          reasonCode: validation.reasonCode,
          parentRunId: params.parentRunId,
          ...(validation.selectedExecutorId ? { selectedExecutorId: validation.selectedExecutorId } : {}),
          summary: validation.summary,
        }],
      })
      appendParentEvent(
        params.parentRunId,
        [
          "dispatch_to_child_executor_blocked",
          task.taskId,
          agent.source,
          agent.agentId,
          validation.reasonCode,
          validation.selectedExecutorId ? `selected=${validation.selectedExecutorId}` : undefined,
          topologyAssignment.topologyId ? `topology=${topologyAssignment.topologyId}` : undefined,
          topologyAssignment.topologyExecutorId ? `executor=${topologyAssignment.topologyExecutorId}` : undefined,
        ].filter(Boolean).join(":"),
      )
      return
    }
    const subSessionId = `sub-session:${randomUUID()}`
    const command = commandRequestFor({
      task,
      agent,
      subSessionId,
      parentRunId: params.parentRunId,
      parentSessionId: params.parentSessionId,
      parentRequestId: params.plan.parentRequestId,
    })
    const bundle = buildAgentPromptBundle({
      agent: agent.config,
      taskScope: task.scope,
      teams,
      workDir: params.workDir,
      parentRunId: params.parentRunId,
      parentRequestId: params.plan.parentRequestId,
      auditCorrelationId: params.parentRunId,
    })
    const prompt = buildDelegatedTaskExecutionPrompt({
      renderedPrompt: bundle.renderedPrompt,
      task,
      originalRequest,
    })
    const requestDiagnosis = await resolvePreDispatchRequestDiagnosis({
      dependencies,
      appendParentEvent,
      parentRunId: params.parentRunId,
      parentAgentName: params.parentAgentName,
      task,
      originalRequest,
    })
    const handoffAudit = auditRuntimeWorkHandoffProjection({
      command,
      parentWorkId: `work:${params.parentRunId}`,
      parentStepId: task.taskId,
      parentAgentName: params.parentAgentName,
      targetAgentName: agentName,
      userRequestSummary: originalRequest,
      ...(requestDiagnosis ? { requestDiagnosis } : {}),
      retryLimit: Number.MAX_SAFE_INTEGER,
      stopCondition:
        "Stop when the delegated completion criteria are verified, an explicit policy or safety boundary blocks execution, cancellation or a user decision is required, or no materially changed strategy remains.",
    })
    recordStructuredWorkAuditEventSafely({
      audit: handoffAudit,
      runId: params.parentRunId,
      subSessionId,
      agentId: agent.agentId,
      stage: "pre_dispatch_handoff",
      source: "orchestration-dispatch",
      dedupeKey: [
        "orchestration:structured-work-audit",
        "pre_dispatch_handoff",
        params.parentRunId,
        subSessionId,
        task.taskId,
      ].join(":"),
      payload: {
        taskId: task.taskId,
      },
    })
    if (handoffAudit.status === "valid" && handoffAudit.value) {
      recordRuntimeWorkRecordSnapshotSafely({
        snapshotKind: "work_handoff_package",
        stage: "pre_dispatch_handoff",
        record: handoffAudit.value,
        parentRunId: params.parentRunId,
        subSessionId,
        agentId: agent.agentId,
        taskId: task.taskId,
        source: "orchestration-dispatch",
      })
    }
    if (handoffAudit.status !== "valid" || !handoffAudit.value) {
      const failedAt = now()
      attempted += 1
      const reasonCode = "request_diagnosis_required"
      const summary = [
        "Sub-agent dispatch was blocked because a valid request diagnosis is required before delegation.",
        handoffAudit.reasonCode ? `audit=${handoffAudit.reasonCode}` : undefined,
      ].filter(Boolean).join(" ")
      outcomes.push({
        taskId: task.taskId,
        subSessionId,
        agentId: agent.agentId,
        agentName,
        agentSource: agent.source,
        ...topologyAssignment,
        status: "failed",
        reasonCode,
        summary,
        completedAt: failedAt,
        lifecycle: [{
          status: "failed",
          at: failedAt,
          reasonCode,
          parentRunId: params.parentRunId,
          selectedExecutorId: validation.selectedExecutorId ?? agent.agentId,
          subSessionId,
          summary,
        }],
      })
      appendParentEvent(
        params.parentRunId,
        [
          "sub_agent_dispatch_blocked",
          task.taskId,
          agent.source,
          agent.agentId,
          reasonCode,
          handoffAudit.reasonCode ? `audit=${handoffAudit.reasonCode}` : undefined,
          topologyAssignment.topologyId ? `topology=${topologyAssignment.topologyId}` : undefined,
          topologyAssignment.topologyExecutorId ? `executor=${topologyAssignment.topologyExecutorId}` : undefined,
        ].filter(Boolean).join(":"),
      )
      return
    }
    const delegationSnapshot = buildDelegatedExecutionSnapshot({
      command,
      handoff: handoffAudit.value,
      agent: { agentId: agent.agentId, agentName },
      promptBundle: bundle.bundle,
    })
    if (!delegationSnapshot.ok) {
      const failedAt = now()
      attempted += 1
      outcomes.push({
        taskId: task.taskId,
        subSessionId,
        agentId: agent.agentId,
        agentName,
        agentSource: agent.source,
        ...topologyAssignment,
        status: "failed",
        reasonCode: delegationSnapshot.reasonCode,
        summary: "Sub-agent dispatch was blocked by execution snapshot validation.",
        completedAt: failedAt,
      })
      appendParentEvent(
        params.parentRunId,
        `sub_agent_dispatch_snapshot_blocked:${task.taskId}:${agent.agentId}:${delegationSnapshot.reasonCode}`,
      )
      return
    }
    attempted += 1
    const startedAt = now()
    const outcomeRecord: DelegatedTaskDispatchOutcome = {
      taskId: task.taskId,
      subSessionId,
      agentId: agent.agentId,
      agentName,
      agentSource: agent.source,
      ...topologyAssignment,
      status: "running",
      startedAt,
      lifecycle: [{
        status: "running",
        at: startedAt,
        parentRunId: params.parentRunId,
        selectedExecutorId: validation.selectedExecutorId ?? agent.agentId,
        subSessionId,
        summary: "Sub-agent dispatch started.",
      }],
    }
    outcomes.push(outcomeRecord)
    appendParentEvent(
      params.parentRunId,
      [
        "sub_agent_dispatch_running",
        task.taskId,
        agent.source,
        agent.agentId,
        topologyAssignment.topologyId ? `topology=${topologyAssignment.topologyId}` : undefined,
        topologyAssignment.topologyExecutorId ? `executor=${topologyAssignment.topologyExecutorId}` : undefined,
      ].filter(Boolean).join(":"),
    )
    appendParentEvent(
      params.parentRunId,
      [
        "dispatch_to_child_executor_validated",
        task.taskId,
        agent.agentId,
        `parent=${params.parentRunId}`,
        `subSession=${subSessionId}`,
        `selected=${validation.selectedExecutorId ?? agent.agentId}`,
        topologyAssignment.topologyExecutorId ? `executor=${topologyAssignment.topologyExecutorId}` : undefined,
      ].filter(Boolean).join(":"),
    )
    const outcome = await runner.runSubSession(
      {
        command,
        agent: {
          agentId: agent.agentId,
          agentName,
        },
        parentAgent: {
          agentId: delegationForest?.rootAgentId ?? ROOT_AGENT_ID,
          agentName: params.parentAgentName,
        },
        parentSessionId: params.parentSessionId,
        promptBundle: bundle.bundle,
        delegationSnapshot: delegationSnapshot.snapshot,
        parentAbortSignal: params.controller.signal,
      },
      async (input: RunSubSessionInput, controls) => {
        await controls.emitProgress("서브 에이전트 실행을 시작했습니다.", "running")
        let started: StartedRootRun
        try {
          started = dependencies.startSubAgentRun({
            artifactStorage: params.artifactStorage,
            memoryJournal: params.memoryJournal,
            hierarchyStorage: params.hierarchyStorage,
            message: prompt,
            sessionId: params.parentSessionId,
            requestGroupId: `${params.parentRunId}:${input.command.subSessionId}`,
            lineageRootRunId: params.parentRequestGroupId,
            forceRequestGroupReuse: true,
            parentRunId: params.parentRunId,
            originRunId: params.parentRunId,
            originRequestGroupId: params.parentRequestGroupId,
            model: controls.modelExecution.modelId,
            providerId: controls.modelExecution.providerId,
            config: dependencies.config,
            targetId: agent.agentId,
            targetLabel: agentName,
            source: params.source,
            skipIntake: true,
            toolsEnabled: true,
            contextMode: "handoff",
            taskProfile: taskProfileForScope(task.scope),
            runScope: "child",
            handoffSummary: input.delegationSnapshot?.handoff.task_goal ?? task.scope.goal,
            originalRequest,
            workDir: params.workDir,
          })
        } catch (error) {
          const failedAt = now()
          const safeMessage = orchestrationDispatchErrorMessage(error)
          outcomeRecord.status = "failed"
          outcomeRecord.reasonCode = "child_run_creation_failed"
          outcomeRecord.completedAt = failedAt
          outcomeRecord.summary = safeMessage
          outcomeRecord.lifecycle?.push({
            status: "failed",
            at: failedAt,
            reasonCode: "child_run_creation_failed",
            parentRunId: params.parentRunId,
            selectedExecutorId: validation.selectedExecutorId ?? agent.agentId,
            subSessionId: input.command.subSessionId,
            summary: safeMessage,
          })
          appendParentEvent(
            params.parentRunId,
            [
              "sub_agent_child_run_creation_failed",
              task.taskId,
              agent.agentId,
              input.command.subSessionId,
              safeMessage,
            ].filter(Boolean).join(":"),
          )
          throw new Error(`child_run_creation_failed:${safeMessage}`)
        }
        const pendingAt = now()
        outcomeRecord.status = "pending_result"
        outcomeRecord.childRunId = started.runId
        outcomeRecord.lifecycle?.push({
          status: "pending_result",
          at: pendingAt,
          parentRunId: params.parentRunId,
          selectedExecutorId: validation.selectedExecutorId ?? agent.agentId,
          subSessionId: input.command.subSessionId,
          childRunId: started.runId,
          summary: "Child run started; awaiting result report.",
        })
        appendParentEvent(
          params.parentRunId,
          `sub_agent_dispatch_pending_result:${task.taskId}:${agent.agentId}:${started.runId}`,
        )
        updateParentSummary(params.parentRunId, "서브 에이전트 결과를 기다리고 있습니다.")
        const childRun = await started.finished
        const failedStatuses = new Set<RootRun["status"]>(["failed", "cancelled", "interrupted"])
        const reportStatus: ResultReport["status"] =
          childRun && !failedStatuses.has(childRun.status) ? "completed" : "failed"
        await controls.emitProgress(
          reportStatus === "completed"
            ? "서브 에이전트 실행을 완료했습니다."
            : "서브 에이전트 실행이 실패했습니다.",
          "running",
        )
        return reportFor({
          command: input.command,
          agent,
          status: reportStatus,
          childRun,
          risksOrGaps: reportStatus === "completed"
            ? uniqueStrings(bundle.issueCodes)
            : uniqueStrings([
                ...bundle.issueCodes,
                childRun?.summary ?? "child_run_failed",
              ]),
        })
      },
    )
    const summary = resultSummary(outcome.resultReport)
    const completedAt = now()
    const finalStatus = outcome.status === "completed" ? "completed" : "failed"
    outcomeRecord.subSessionId = outcome.subSession.subSessionId
    outcomeRecord.status = finalStatus
    outcomeRecord.completedAt = completedAt
    if (outcomeRecord.reasonCode !== "child_run_creation_failed" && outcome.errorReport?.reasonCode) {
      outcomeRecord.reasonCode = outcome.errorReport.reasonCode
    }
    if (outcome.resultReport?.evidence[0]?.sourceRef) {
      outcomeRecord.childRunId = outcome.resultReport.evidence[0].sourceRef
    }
    if (summary) outcomeRecord.summary = summary
    if (outcome.parentAggregationTrace?.nextAction) {
      outcomeRecord.parentAggregationNextAction = outcome.parentAggregationTrace.nextAction
    }
    if (outcome.feedbackRequest?.feedbackRequestId) {
      outcomeRecord.feedbackRequestId = outcome.feedbackRequest.feedbackRequestId
    }
    outcomeRecord.lifecycle?.push({
      status: finalStatus,
      at: completedAt,
      ...(outcomeRecord.reasonCode ? { reasonCode: outcomeRecord.reasonCode } : {}),
      parentRunId: params.parentRunId,
      selectedExecutorId: validation.selectedExecutorId ?? agent.agentId,
      subSessionId: outcome.subSession.subSessionId,
      ...(outcomeRecord.childRunId ? { childRunId: outcomeRecord.childRunId } : {}),
      ...(summary ? { summary } : {}),
    })
    if (outcomeRecord.reasonCode === "prompt_bundle_preflight_failed") {
      appendParentEvent(
        params.parentRunId,
        `sub_agent_dispatch_preflight_failed:${task.taskId}:${agent.agentId}:${outcome.subSession.subSessionId}`,
      )
    }
    if (outcome.status === "cancelled") {
      appendParentEvent(
        params.parentRunId,
        `sub_agent_dispatch_cancelled:${task.taskId}:${agent.agentId}:${outcome.subSession.subSessionId}`,
      )
    }
    appendParentEvent(
      params.parentRunId,
      [
        "delegated_task_result",
        task.taskId,
        agent.source,
        agent.agentId,
        agentName,
        outcome.status === "completed" ? "completed" : "failed",
        topologyAssignment.topologyId ? `topology=${topologyAssignment.topologyId}` : undefined,
        topologyAssignment.topologyExecutorId ? `executor=${topologyAssignment.topologyExecutorId}` : undefined,
      ].filter(Boolean).join(":"),
    )
  }

  const dispatchTeamTask = async (task: OrchestrationTask, teamId: string): Promise<void> => {
    const blockReason = teamDispatchBlockReason(task)
    if (blockReason) {
      outcomes.push({
        taskId: task.taskId,
        status: "skipped",
        reasonCode: blockReason,
        summary: `Skipped team dispatch for ${teamId} because the team was not explicitly selected.`,
      })
      appendParentEvent(params.parentRunId, `team_dispatch_skipped:${task.taskId}:${teamId}:${blockReason}`)
      return
    }

    const teamPlan = buildTeamExecutionPlan({
      teamId,
      teamExecutionPlanId: `team-plan:${params.parentRunId}:${task.taskId}`,
      parentRunId: params.parentRunId,
      parentRequestId: params.plan.parentRequestId,
      userRequest: task.scope.goal,
      persist: true,
      auditId: params.parentRunId,
    }, {
      config: dependencies.config,
      storage: params.hierarchyStorage,
      ...(dependencies.now ? { now: dependencies.now } : {}),
      ...(dependencies.idProvider
        ? { idProvider: (prefix: string) => `${prefix}:${dependencies.idProvider?.()}` }
        : {}),
    })
    if (!teamPlan.ok || !teamPlan.plan) {
      const reasonCode = teamPlan.diagnostics[0]?.reasonCode ?? "team_execution_plan_failed"
      outcomes.push({
        taskId: task.taskId,
        status: "failed",
        reasonCode,
        summary: `Team execution plan failed for ${teamId}.`,
      })
      appendParentEvent(params.parentRunId, `team_dispatch_failed:${task.taskId}:${teamId}:${reasonCode}`)
      return
    }

    appendParentEvent(
      params.parentRunId,
      `team_execution_planned:${teamPlan.plan.teamExecutionPlanId}:${teamId}:assignments=${teamPlan.plan.memberTaskAssignments.length}`,
    )
    const expandedTasks = teamPlan.plan.memberTaskAssignments
      .flatMap((assignment) => assignment.tasks ?? [])
      .filter((teamTask) => teamTask.executionKind === "delegated_sub_agent" && teamTask.assignedAgentId)
      .sort((left, right) =>
        teamTaskOrder(left.taskKind) - teamTaskOrder(right.taskKind) ||
        left.taskId.localeCompare(right.taskId),
      )
      .map((teamTask) => orchestrationTaskFromTeamTask(teamTask, task))

    if (expandedTasks.length === 0) {
      outcomes.push({
        taskId: task.taskId,
        status: "failed",
        reasonCode: "team_execution_plan_no_delegated_tasks",
        summary: `Team execution plan produced no delegated tasks for ${teamId}.`,
      })
      appendParentEvent(params.parentRunId, `team_dispatch_failed:${task.taskId}:${teamId}:team_execution_plan_no_delegated_tasks`)
      return
    }

    for (const expandedTask of expandedTasks) {
      const agentId = expandedTask.assignedAgentId
      const agent = agentId ? agentsById.get(agentId) : undefined
      if (!agentId || !agent) {
        outcomes.push({
          taskId: expandedTask.taskId,
          status: "skipped",
          reasonCode: agentId ? "assigned_agent_missing" : "assigned_agent_missing",
        })
        appendParentEvent(params.parentRunId, `sub_agent_dispatch_skipped:${expandedTask.taskId}:assigned_agent_missing`)
        continue
      }
      await dispatchAgentTask(expandedTask, agent)
    }
  }

  appendParentEvent(params.parentRunId, `sub_agent_dispatch_started:${dispatchOrder.tasks.length}`)
  updateParentSummary(params.parentRunId, "서브 에이전트에게 작업을 위임하고 있습니다.")

  for (const task of dispatchOrder.tasks) {
    const agentId = task.assignedAgentId
    const agent = agentId ? agentsById.get(agentId) : undefined
    if (agentId && agent) {
      await dispatchAgentTask(task, agent)
      continue
    }
    if (task.assignedTeamId) {
      await dispatchTeamTask(task, task.assignedTeamId)
      continue
    }
    if (!agentId || !agent) {
      outcomes.push({
        taskId: task.taskId,
        status: "skipped",
        reasonCode: agentId ? "assigned_agent_missing" : "assigned_agent_missing",
      })
      appendParentEvent(params.parentRunId, `sub_agent_dispatch_skipped:${task.taskId}:assigned_agent_missing`)
      continue
    }
  }

  const completed = outcomes.filter((outcome) => outcome.status === "completed").length
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length
  const skipped = outcomes.filter((outcome) => outcome.status === "skipped").length
  appendParentEvent(
    params.parentRunId,
    `sub_agent_dispatch_finished:attempted=${attempted};completed=${completed};failed=${failed};skipped=${skipped}`,
  )
  return { attempted, completed, failed, skipped, outcomes }
}
