import type { AgentContextMode } from "../agent/index.js"
import type {
  ResponseLanguageMode,
  TaskExecutionSemantics,
  TaskIntentEnvelope,
  TaskStructuredRequest,
} from "../agent/intake.js"
import type { AIProvider, AIProviderConfigSnapshot } from "../ai/index.js"
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js"
import type { KnowbeeConfig } from "../config/types.js"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type {
  LlmCapabilitySelectionAttemptProvider,
  LlmCapabilitySelectionSchemaRepairProvider,
} from "../contracts/llm-capability-selection.js"
import type {
  LlmSolutionPlanProvider,
  LlmSolutionPlanRepairProvider,
} from "../contracts/llm-solution-plan-provider.js"
import type { CapabilitySelectionDecisionTraceSink } from "../contracts/capability-selection-decision-trace.js"
import { SqliteCanonicalPendingResponseRepository } from "../db/canonical-pending-response-repository.js"
import { SqliteCanonicalWorkReceiptRepository } from "../db/canonical-work-receipt-repository.js"
import { SqliteCanonicalWorkRepository } from "../db/canonical-work-repository.js"
import { getDb, insertMessage } from "../db/index.js"
import { eventBus } from "../events/index.js"
import { recordLatencyMetric } from "../observability/latency.js"
import type { MemoryJournalRepository } from "../memory/journal.js"
import type {
  AgentExecutionDecision,
  AgentExecutionDecisionTraceSnapshot,
} from "../orchestration/execution-decision-contract.js"
import type { AgentHierarchyStorage } from "../orchestration/hierarchy.js"
import { buildOrchestrationRegistrySnapshot } from "../orchestration/registry.js"
import { grantRunApprovalScope, grantRunSingleApproval } from "../tools/runtime-dispatcher.js"
import type { AnyTool } from "../tools/types.js"
import type { SyntheticApprovalRuntimeDependencies } from "./approval.js"
import {
  buildCanonicalAttemptEvidenceDescriptor,
  recordCanonicalAttemptEvidence,
} from "./canonical-attempt-evidence.js"
import type {
  CapabilityRuntimeHealthObservation,
  YeonjangAgentBindingObservation,
} from "./canonical-capability-snapshot.js"
import type {
  CapabilitySelectionSkillBinding,
  CapabilitySelectionSkillDefinition,
} from "./capability-selection-snapshot.js"
import type {
  InstructionSkillRunSnapshot,
  InstructionSkillSnapshotFinding,
} from "./instruction-skill-snapshot.js"
import {
  recordCanonicalAnalysisRevision,
} from "./canonical-analysis-revision.js"
import {
  buildCanonicalExecutionAdmissionDescriptor,
  recordCanonicalExecutionAdmission,
} from "./canonical-execution-admission.js"
import {
  type CanonicalFinalizationTransitionDescriptor,
  buildCanonicalCancellationDescriptor,
  buildCanonicalPolicyInputRequiredDescriptor,
  recordCanonicalFinalizationTransition,
} from "./canonical-finalization-lifecycle.js"
import {
  buildCanonicalIntakeDiagnosisDescriptor,
  recordCanonicalIntakeDiagnosis,
} from "./canonical-intake-diagnosis.js"
import { recordCanonicalIntakeAnalysis } from "./canonical-intake-analysis.js"
import {
  buildCanonicalIntakePlanPolicy,
  recordCanonicalIntakePlanPolicy,
} from "./canonical-intake-plan-policy.js"
import { planCanonicalSelfSolveCapabilities } from "./canonical-self-solve-capability-planning.js"
import { resolveChannelArtifactDeliveryRequirement } from "./channel-artifact-delivery-requirement.js"
import {
  buildCanonicalRecoveryReentryDescriptor,
  recordCanonicalRecoveryReentry,
} from "./canonical-recovery-reentry.js"
import { evaluateCanonicalRecoveryStrategyAdmission } from "./canonical-recovery-strategy-admission.js"
import { releaseCanonicalSimplePath } from "./canonical-simple-path.js"
import {
  buildCanonicalTopologyAdmissionDescriptor,
  buildCanonicalTopologyResultDescriptor,
  recordCanonicalTopologyAdmission,
  recordCanonicalTopologyResult,
} from "./canonical-topology-lifecycle.js"
import { resolveCanonicalTransitionCursor } from "./canonical-transition-cursor.js"
import { createCanonicalTerminalEvidencePort } from "./canonical-terminal-evidence.js"
import { type RunChunkDeliveryHandler, logAssistantReply } from "./delivery.js"
import type { ActiveQueueCancellationMode } from "./entry-semantics.js"
import { projectAgentExecutionToolBindings } from "./execution-tool-bindings.js"
import type { FinalResponseIdentityContext } from "./final-response-renderer.js"
import type { FinalizationDependencies, FinalizationSource } from "./finalization.js"
import { enqueueSessionIntake } from "./intake-queue.js"
import type { RootRunDriverDependencies } from "./root-run-driver.js"
import { resolveRunRoute } from "./routing.js"
import { scheduleDelayedRootRun } from "./run-queueing.js"
import {
  type AdmittedCapabilityExecutionScope,
  createPolicyCapabilityExecutionScope,
  createPolicyMethodCapabilityExecutionScope,
  createSolutionPlanCapabilityExecutionScope,
} from "./run-scoped-tool-admission.js"
import {
  buildSolutionPlanCapabilityAdmission,
  recordSolutionPlanCapabilityAdmission,
  resolveOwnerScopedCapabilitySelectionTargets,
} from "./solution-plan-capability-admission.js"
import { createRuntimeSolutionPlanProvider } from "./solution-plan-provider-runtime.js"
import {
  buildStartFinalizationDependencies,
  executeStartLoopDirective,
  runStartIntakeBridge,
} from "./start-bridges.js"
import {
  createFirstResponseDeadline,
  type FirstResponseDeadline,
} from "./first-response-deadline.js"
import { createFirstResponseReceiptRecorder } from "./first-response-receipt.js"
import {
  markAbortedRunCancelledIfActive,
  normalizeTaskProfile,
  rememberRunAwaitingUser,
  rememberRunFailure,
  rememberRunSuccess,
  runFilesystemVerificationSubtask,
  tryHandleActiveQueueCancellation,
} from "./start-support.js"
import {
  appendRunEvent,
  applyCanonicalRunTransition,
  cancelRootRun,
  clearActiveRunController,
  getRootRun,
  incrementDelegationTurnCount,
  mergeRunPromptSourceSnapshot,
  setRunStepStatus,
  updateRunStatus,
  updateRunSummary,
} from "./store.js"
import type { RootRun, TaskProfile } from "./types.js"
import type { WorkerRuntimeTarget } from "./worker-runtime.js"

function syntheticApprovalScopeKey(runId: string, toolName: string): string {
  return `${runId}\u0000${toolName.trim()}`
}

function hasSyntheticApprovalScope(
  scopes: ReadonlySet<string>,
  runId: string,
  toolName: string,
): boolean {
  return Boolean(toolName.trim()) && scopes.has(syntheticApprovalScopeKey(runId, toolName))
}

function clearSyntheticApprovalScopes(scopes: Set<string>, runId: string): void {
  const prefix = `${runId}\u0000`
  for (const scope of scopes) {
    if (scope.startsWith(prefix)) scopes.delete(scope)
  }
}

export type StartRootRunDriverRuntimeConfig = KnowbeeConfig

export function buildStartRootRunDriverDependencies(params: {
  artifactStorage: ArtifactStorageContext
  memoryJournal: MemoryJournalRepository
  hierarchyStorage: AgentHierarchyStorage
  runId: string
  controller: AbortController
  sessionId: string
  requestGroupId: string
  source: FinalizationSource
  onChunk: RunChunkDeliveryHandler | undefined
  message: string
  responseLanguageMode?: ResponseLanguageMode | undefined
  model: string | undefined
  providerId?: string | undefined
  provider?: AIProvider | undefined
  workDir: string
  config: StartRootRunDriverRuntimeConfig
  canonicalPolicyTools: AnyTool[]
  canonicalPolicySnapshotAt: number
  canonicalRuntimeHealthObservations: CapabilityRuntimeHealthObservation[]
  canonicalYeonjangAgentBindings: YeonjangAgentBindingObservation[]
  capabilitySelection?: {
    ownerAgentId: string
    skillDefinitions: readonly CapabilitySelectionSkillDefinition[]
    skillBindings: readonly CapabilitySelectionSkillBinding[]
    instructionSkills: readonly InstructionSkillRunSnapshot[]
    instructionSkillFindings: readonly InstructionSkillSnapshotFinding[]
    setupFailureReasonCode?: "capability_selection_catalog_invalid" | undefined
    provider?:
      | (LlmCapabilitySelectionAttemptProvider & Partial<LlmCapabilitySelectionSchemaRepairProvider>)
      | undefined
    traceSink?: CapabilitySelectionDecisionTraceSink | undefined
    externalTransferAllowed: boolean
    maxCost: "none" | "low" | "high"
  } | undefined
  solutionPlanning?: {
    provider: LlmSolutionPlanProvider
    repairProvider?: LlmSolutionPlanRepairProvider | undefined
    now?: (() => number) | undefined
  } | undefined
  toolsEnabled: boolean
  finalResponseIdentityContext?: FinalResponseIdentityContext | undefined
  reuseConversationContext: boolean
  suppressFinalDelivery?: boolean
  activeQueueCancellationMode: ActiveQueueCancellationMode | null
  startNestedRootRun: (params: {
    artifactStorage: ArtifactStorageContext
    memoryJournal: MemoryJournalRepository
    hierarchyStorage: AgentHierarchyStorage
    message: string
    sessionId: string
    requestGroupId?: string | undefined
    originRunId?: string | undefined
    originRequestGroupId?: string | undefined
    model: string | undefined
    providerId?: string | undefined
    provider?: AIProvider | undefined
    config: StartRootRunDriverRuntimeConfig
    targetId?: string | undefined
    targetLabel?: string | undefined
    agentExecutionDecision?: AgentExecutionDecision | undefined
    agentExecutionDecisionTrace?: AgentExecutionDecisionTraceSnapshot | undefined
    workerRuntime?: WorkerRuntimeTarget | undefined
    workDir?: string | undefined
    source: FinalizationSource
    skipIntake?: boolean | undefined
    toolsEnabled?: boolean | undefined
    contextMode?: AgentContextMode | undefined
    taskProfile?: TaskProfile | undefined
    originalRequest?: string | undefined
    executionSemantics?: TaskExecutionSemantics | undefined
    structuredRequest?: TaskStructuredRequest | undefined
    intentEnvelope?: TaskIntentEnvelope | undefined
    immediateCompletionText?: string | undefined
    onChunk?: RunChunkDeliveryHandler
  }) => { finished: Promise<RootRun | undefined> }
  syntheticApprovalScopes: Set<string>
  logInfo: (message: string, payload?: Record<string, unknown>) => void
  logFieldDebug?: (message: string, payload?: Record<string, unknown>) => void
  logWarn: (message: string) => void
  logError: (message: string, payload?: Record<string, unknown>) => void
  monotonicNow?: () => number
  firstResponseDeadline?: FirstResponseDeadline
}): {
  finalizationDependencies: FinalizationDependencies
  syntheticApprovalRuntimeDependencies: SyntheticApprovalRuntimeDependencies
  driverDependencies: RootRunDriverDependencies
} {
  const maxDelegationTurns = params.config.orchestration.maxDelegationTurns
  const monotonicNow = params.monotonicNow ?? (() => performance.now())
  const firstResponseDeadline =
    params.firstResponseDeadline ?? createFirstResponseDeadline(monotonicNow())
  const recordFirstResponseReceipt = createFirstResponseReceiptRecorder({
    runId: params.runId,
    sessionId: params.sessionId,
    requestGroupId: params.requestGroupId,
    source: params.source,
    deadline: firstResponseDeadline,
    recordLatencyMetric,
  })
  const finalizationDependencies = buildStartFinalizationDependencies({
    appendRunEvent,
    setRunStepStatus,
    updateRunStatus,
    rememberRunSuccess: (input) =>
      rememberRunSuccess({ ...input, memoryJournal: params.memoryJournal }),
    rememberRunFailure: (input) =>
      rememberRunFailure({ ...input, memoryJournal: params.memoryJournal }),
    rememberRunAwaitingUser,
    onDeliveryError: (deliveryMessage) => params.logWarn(deliveryMessage),
    recordFirstResponseReceipt,
    firstResponseMonotonicNow: monotonicNow,
  })

  const executionTools = projectAgentExecutionToolBindings({
    tools: params.canonicalPolicyTools,
    source: params.source,
    toolsEnabled: params.toolsEnabled,
  })
  const canonicalPolicyRegistrySnapshot = buildOrchestrationRegistrySnapshot({
    config: params.config,
  })
  const canonicalPolicyTools = [...params.canonicalPolicyTools]
  let admittedCapabilityExecutionScope: AdmittedCapabilityExecutionScope | undefined
  let pendingCapabilityAdmissionContext:
    | {
        policy: Extract<
          ReturnType<typeof buildCanonicalIntakePlanPolicy>,
          { ok: true }
        >
        ownerAgentId: string
      }
    | undefined
  const canonicalRecoveryTargetIds = new Set<string>(["agent:knowbee"])
  const canonicalRecoveryProviderIds = new Set<string>()
  for (const agent of canonicalPolicyRegistrySnapshot.agents) {
    if (agent.status === "enabled" || agent.status === "degraded")
      canonicalRecoveryTargetIds.add(agent.agentId)
  }
  for (const providerId of [
    params.providerId,
    params.provider?.id,
    params.config.ai?.connection.provider,
  ]) {
    const normalized = providerId?.trim()
    if (!normalized) continue
    canonicalRecoveryTargetIds.add(normalized)
    canonicalRecoveryTargetIds.add(
      normalized.startsWith("provider:") ? normalized : `provider:${normalized}`,
    )
    canonicalRecoveryProviderIds.add(
      normalized.startsWith("provider:") ? normalized : `provider:${normalized}`,
    )
  }
  const canonicalRecoveryStrategyFingerprints = new Set<string>()
  const persistCanonicalFinalizationTransition = async (
    descriptor: CanonicalFinalizationTransitionDescriptor,
  ): Promise<{ ok: true } | { ok: false; reasonCode: string }> => {
    const database = getDb()
    const workRepository = new SqliteCanonicalWorkRepository(database, () => Date.now())
    const aggregate = workRepository.load(descriptor.workId)
    if (!aggregate) return { ok: false, reasonCode: "canonical_finalization_aggregate_not_found" }
    const receiptRepository = new SqliteCanonicalWorkReceiptRepository(database, () => Date.now())
    return recordCanonicalFinalizationTransition(descriptor, {
      issueReceipt: (receipt) => receiptRepository.issue(receipt),
      loadReceipt: (receiptId) => receiptRepository.load(receiptId),
      applyTransition: ({ runId, workId, event, receiptRef, finalOutcome, waitingKind }) =>
        applyCanonicalRunTransition({
          runId,
          workId,
          expectedRevision: aggregate.revision,
          event,
          receiptRef,
          ...(finalOutcome ? { finalOutcome } : {}),
          ...(waitingKind ? { waitingKind } : {}),
        }),
    })
  }
  const syntheticApprovalRuntimeDependencies: SyntheticApprovalRuntimeDependencies = {
    timeoutSec: params.config.security.approvalTimeout,
    fallback: params.config.security.approvalTimeoutFallback === "allow" ? "allow_once" : "deny",
    appendRunEvent,
    setRunStepStatus,
    updateRunStatus,
    cancelRun: (approvalRunId, denial) => {
      cancelRootRun(approvalRunId, denial)
    },
    emitApprovalResolved: (payload) => eventBus.emit("approval.resolved", payload),
    emitApprovalRequest: (payload) => eventBus.emit("approval.request", payload),
    onRequested: (payload) => {
      params.logInfo("synthetic approval requested", payload)
    },
  }
  const driverDependencies: RootRunDriverDependencies = {
    getAdmittedCapabilityExecutionScope: () => admittedCapabilityExecutionScope,
    appendRunEvent,
    updateRunSummary,
    setRunStepStatus,
    updateRunStatus,
    rememberRunFailure: (input) =>
      rememberRunFailure({ ...input, memoryJournal: params.memoryJournal }),
    incrementDelegationTurnCount,
    markAbortedRunCancelledIfActive,
    getDelegationTurnState: () => {
      const currentRun = getRootRun(params.runId)
      return {
        usedTurns: currentRun?.delegationTurnCount ?? 0,
        maxTurns: currentRun?.maxDelegationTurns ?? maxDelegationTurns,
      }
    },
    getFinalizationDependencies: () => finalizationDependencies,
    insertMessage,
    writeReplyLog: logAssistantReply,
    createId: () => crypto.randomUUID(),
    now: () => Date.now(),
    runVerificationSubtask: ({ originalRequest, mutationPaths }) => {
      return runFilesystemVerificationSubtask({
        parentRunId: params.runId,
        requestGroupId: params.requestGroupId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        originalRequest,
        mutationPaths,
        workDir: params.workDir,
      })
    },
    rememberRunApprovalScope: (approvedRunId, toolName) => {
      if (toolName.trim()) {
        params.syntheticApprovalScopes.add(syntheticApprovalScopeKey(approvedRunId, toolName))
      }
    },
    grantRunApprovalScope,
    grantRunSingleApproval,
    onDeliveryError: (message) => params.logWarn(message),
    onReviewError: (message) => {
      params.logWarn(`completion review failed: ${message}`)
    },
    recordCanonicalAttempt: async ({ runId, attempt, successfulToolNames }) => {
      const descriptor = buildCanonicalAttemptEvidenceDescriptor({
        runId,
        attempt,
        successfulToolNames,
      })
      const database = getDb()
      const aggregate = new SqliteCanonicalWorkRepository(database, () => Date.now()).load(
        descriptor.workId,
      )
      if (!aggregate || aggregate.state !== "EXECUTING") {
        return { ok: false, reasonCode: "canonical_attempt_not_executing" }
      }
      const receiptRepository = new SqliteCanonicalWorkReceiptRepository(database, () => Date.now())
      const recorded = recordCanonicalAttemptEvidence(descriptor, {
        issueReceipt: (receipt) => receiptRepository.issue(receipt),
        loadReceipt: (receiptId) => receiptRepository.load(receiptId),
        applyAttemptTransition: ({ runId: transitionRunId, workId, receiptRef }) =>
          applyCanonicalRunTransition({
            runId: transitionRunId,
            workId,
            expectedRevision: aggregate.revision,
            event: "ATTEMPT_RECORDED",
            receiptRef,
          }),
      })
      return recorded.ok
        ? { ok: true, evidenceRefs: [...descriptor.evidenceRefs] }
        : recorded
    },
    recordCanonicalRecoveryReentry: async (input) => {
      const built = buildCanonicalRecoveryReentryDescriptor({
        ...input,
        allowedTargetIds: canonicalRecoveryTargetIds,
        allowedProviderIds: canonicalRecoveryProviderIds,
        cancellationTokenId: `root-run:${input.runId}`,
        signalAborted: params.controller.signal.aborted,
      })
      if (!built.ok) return built

      const strategyAdmission = evaluateCanonicalRecoveryStrategyAdmission({
        attemptedStrategyFingerprints: canonicalRecoveryStrategyFingerprints,
        nextStrategyFingerprint: built.descriptor.strategyFingerprint,
      })
      if (!strategyAdmission.ok) return strategyAdmission

      const database = getDb()
      const workRepository = new SqliteCanonicalWorkRepository(database, () => Date.now())
      const receiptRepository = new SqliteCanonicalWorkReceiptRepository(database, () => Date.now())
      const aggregate = workRepository.load(built.descriptor.workId)
      if (!aggregate) return { ok: false, reasonCode: "canonical_recovery_aggregate_not_found" }
      const consumedRecoveryRevision = receiptRepository.load(
        built.descriptor.receipts[0].receiptId,
      )?.consumedRevision
      const startRevision =
        consumedRecoveryRevision !== undefined
          ? consumedRecoveryRevision - 1
          : aggregate.state === "RESULT_REVIEW" || aggregate.state === "PARTIALLY_SUCCEEDED"
            ? aggregate.revision
            : -1
      if (startRevision < 0) return { ok: false, reasonCode: "canonical_recovery_state_invalid" }

      const recorded = recordCanonicalRecoveryReentry(built.descriptor, startRevision, {
        issueReceipt: (receipt) => receiptRepository.issue(receipt),
        loadReceipt: (receiptId) => receiptRepository.load(receiptId),
        applyTransition: ({ runId, workId, expectedRevision, event, receiptRef }) =>
          applyCanonicalRunTransition({
            runId,
            workId,
            expectedRevision,
            event,
            receiptRef,
          }),
      })
      if (recorded.ok) {
        canonicalRecoveryStrategyFingerprints.add(built.descriptor.strategyFingerprint)
      }
      return recorded
    },
    recordCanonicalCompletionOutcome: persistCanonicalFinalizationTransition,
    recordCanonicalDelivery: persistCanonicalFinalizationTransition,
    stageCanonicalPendingResponse: async (input) => {
      const staged = new SqliteCanonicalPendingResponseRepository(getDb(), () => Date.now()).stage(
        input,
      )
      return staged.staged ? { ok: true } : { ok: false, reasonCode: staged.reasonCode }
    },
    consumeCanonicalPendingResponse: async (runId) => {
      const consumed = new SqliteCanonicalPendingResponseRepository(getDb(), () =>
        Date.now(),
      ).markConsumed(runId)
      return consumed.consumed ? { ok: true } : { ok: false, reasonCode: consumed.reasonCode }
    },
    recordCanonicalCancellation: async ({ runId, cancellationKind, signalAborted }) => {
      const built = buildCanonicalCancellationDescriptor({
        runId,
        cancellationKind,
        cancellationTokenId: `root-run:${runId}`,
        signalAborted,
      })
      if (!built.ok) return built
      const persisted = await persistCanonicalFinalizationTransition(built.descriptor)
      return persisted.ok ? { ok: true, receiptRef: built.descriptor.receipt.receiptId } : persisted
    },
    getCanonicalTerminalOutcome: (runId) => {
      const aggregate = new SqliteCanonicalWorkRepository(getDb(), () => Date.now()).load(
        canonicalWorkIdForRootRun(runId),
      )
      return aggregate?.state === "BLOCKED"
        ? "blocked"
        : aggregate?.state === "CANCELLED"
          ? "cancelled"
          : aggregate?.state === "USER_INPUT_REQUIRED"
            ? getRootRun(runId)?.status === "awaiting_approval"
              ? "approval"
              : "user_input"
            : null
    },
    getCanonicalTerminalEvidence: (runId) => {
      const database = getDb()
      const port = createCanonicalTerminalEvidencePort({
        loadAggregate: (workId) =>
          new SqliteCanonicalWorkRepository(database, () => Date.now()).load(workId),
        loadReceipt: (receiptId) =>
          new SqliteCanonicalWorkReceiptRepository(database, () => Date.now()).load(receiptId),
      })
      return port.read(canonicalWorkIdForRootRun(runId))
    },
    admitCanonicalTopologyExecution: async ({
      runId,
      route,
      requestDiagnosisReceiptId,
      solutionPlanReceiptId,
      capabilitySelections,
    }) => {
      let capabilityAdmissionReceiptId: string | undefined
      if (capabilitySelections.length > 0) {
        if (!pendingCapabilityAdmissionContext) {
          return {
            ok: false,
            reasonCode: "capability_admission_context_missing",
          }
        }
        const policyTargetId =
          pendingCapabilityAdmissionContext.policy.input.constraints.targetId
        const ownerScopedSelectionTargets = policyTargetId
          ? undefined
          : resolveOwnerScopedCapabilitySelectionTargets({
              capabilitySnapshot:
                pendingCapabilityAdmissionContext.policy.input.capabilitySnapshot,
              selections: capabilitySelections,
              ownerAgentId: pendingCapabilityAdmissionContext.ownerAgentId,
            })
        const capabilityAdmission = buildSolutionPlanCapabilityAdmission({
          runId,
          solutionPlanReceiptId,
          policyReceiptId:
            pendingCapabilityAdmissionContext.policy.descriptor.receiptId,
          capabilitySnapshot:
            pendingCapabilityAdmissionContext.policy.input.capabilitySnapshot,
          selections: capabilitySelections,
          ...(policyTargetId
            ? {
                targetId: policyTargetId,
              }
            : {}),
          ...(ownerScopedSelectionTargets
            ? { selectionTargets: ownerScopedSelectionTargets }
            : {}),
          approvedCapabilityIds:
            pendingCapabilityAdmissionContext.policy.input.constraints
              .approvedCapabilityIds,
        })
        if (!capabilityAdmission.ok) return capabilityAdmission
        const capabilityReceiptRepository =
          new SqliteCanonicalWorkReceiptRepository(getDb(), () => Date.now())
        const recordedCapability = recordSolutionPlanCapabilityAdmission(
          capabilityAdmission.descriptor,
          {
            issueReceipt: (receipt) =>
              capabilityReceiptRepository.issue(receipt),
            loadReceipt: (receiptId) =>
              capabilityReceiptRepository.load(receiptId),
          },
        )
        if (!recordedCapability.ok) return recordedCapability
        capabilityAdmissionReceiptId =
          recordedCapability.capabilityAdmissionReceiptId
        const scopeResult = createSolutionPlanCapabilityExecutionScope({
          descriptor: capabilityAdmission.descriptor,
          ownerAgentId: pendingCapabilityAdmissionContext.ownerAgentId,
          skillDefinitions:
            params.capabilitySelection?.skillDefinitions ?? [],
          skillBindings: params.capabilitySelection?.skillBindings ?? [],
          instructionSkills:
            params.capabilitySelection?.instructionSkills ?? [],
        })
        if (!scopeResult.ok) return scopeResult
        admittedCapabilityExecutionScope = scopeResult.scope
      }
      const built = buildCanonicalTopologyAdmissionDescriptor({
        runId,
        route,
        requestDiagnosisReceiptId,
        solutionPlanReceiptId,
        cancellationTokenId: `root-run:${runId}`,
        signalAborted: params.controller.signal.aborted,
      })
      if (!built.ok) return built
      const receiptRepository = new SqliteCanonicalWorkReceiptRepository(getDb(), () => Date.now())
      const recordedTopology = recordCanonicalTopologyAdmission(built.descriptor, {
        issueReceipt: (receipt) => receiptRepository.issue(receipt),
        loadReceipt: (receiptId) => receiptRepository.load(receiptId),
        applyTransition: ({
          runId: transitionRunId,
          workId,
          expectedRevision,
          event,
          receiptRef,
        }) =>
          applyCanonicalRunTransition({
            runId: transitionRunId,
            workId,
            expectedRevision,
            event,
            receiptRef,
          }),
      })
      return recordedTopology.ok
        ? {
            ok: true,
            ...(capabilityAdmissionReceiptId
              ? { capabilityAdmissionReceiptId }
              : {}),
          }
        : recordedTopology
    },
    recordCanonicalTopologyResult: async ({ runId, result, resultDiagnosisReceiptId }) => {
      const built = buildCanonicalTopologyResultDescriptor({
        runId,
        result,
        resultDiagnosisReceiptId,
      })
      if (!built.ok) return built
      const receiptRepository = new SqliteCanonicalWorkReceiptRepository(getDb(), () => Date.now())
      const recorded = recordCanonicalTopologyResult(built.descriptor, {
        issueReceipt: (receipt) => receiptRepository.issue(receipt),
        loadReceipt: (receiptId) => receiptRepository.load(receiptId),
        applyTransition: ({
          runId: transitionRunId,
          workId,
          expectedRevision,
          event,
          receiptRef,
        }) =>
          applyCanonicalRunTransition({
            runId: transitionRunId,
            workId,
            expectedRevision,
            event,
            receiptRef,
          }),
      })
      return recorded.ok
        ? {
            ok: true,
            ...(built.descriptor.verificationEvent
              ? {
                  finalOutcome:
                    built.descriptor.verificationEvent === "ALL_CRITERIA_VERIFIED"
                      ? ("succeeded" as const)
                      : ("partial" as const),
                }
              : built.descriptor.finalOutcome
                ? { finalOutcome: built.descriptor.finalOutcome }
                : {}),
          }
        : recorded
    },
    executeLoopDirective: (directive) =>
      executeStartLoopDirective({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        directive,
        responseContext: {
          originalRequest: params.message,
          ...(params.responseLanguageMode
            ? { responseLanguageMode: params.responseLanguageMode }
            : {}),
          model: params.model,
          ...(params.providerId ? { providerId: params.providerId } : {}),
          ...(params.provider ? { provider: params.provider } : {}),
          config: params.config,
          workDir: params.workDir,
          ...(params.finalResponseIdentityContext
            ? { identityContext: params.finalResponseIdentityContext }
            : {}),
        },
        finalizationDependencies,
        ...(params.suppressFinalDelivery
          ? {
              suppressFinalDelivery: true,
              suppressFinalDeliveryReasonCode: "child_result_parent_aggregation_required",
            }
          : {}),
      }),
    tryHandleActiveQueueCancellation: () =>
      tryHandleActiveQueueCancellation({
        runId: params.runId,
        sessionId: params.sessionId,
        message: params.message,
        mode: params.activeQueueCancellationMode,
      }),
    tryHandleIntakeBridge: ({ currentMessage, originalRequest }) =>
      enqueueSessionIntake(
        {
          sessionId: params.sessionId,
          runId: params.runId,
          requestGroupId: params.requestGroupId,
          task: () =>
            runStartIntakeBridge(
              {
                artifactStorage: params.artifactStorage,
                config: params.config,
                message: currentMessage,
                originalRequest,
                sessionId: params.sessionId,
                requestGroupId: params.requestGroupId,
                model: params.model,
                ...(params.providerId ? { providerId: params.providerId } : {}),
                ...(params.provider ? { provider: params.provider } : {}),
                workDir: params.workDir,
                source: params.source,
                runId: params.runId,
                onChunk: params.onChunk,
                signal: params.controller.signal,
                firstResponseDeadline,
                nowMs: monotonicNow,
                recordFirstResponseReceipt,
                reuseConversationContext: params.reuseConversationContext,
                executionTools,
                scheduleDelayedRun: (delayedParams) =>
                  scheduleDelayedRootRun(delayedParams, {
                    startRootRun: (startParams) =>
                      params.startNestedRootRun({
                        ...startParams,
                        artifactStorage: params.artifactStorage,
                        memoryJournal: params.memoryJournal,
                        hierarchyStorage: params.hierarchyStorage,
                        config: params.config,
                      }),
                    resolveRoute: (input) => resolveRunRoute(input, params.config),
                    logInfo: params.logInfo,
                    logWarn: params.logWarn,
                    logError: params.logError,
                  }),
                startDelegatedRun: (startParams) => {
                  return params.startNestedRootRun({
                    ...startParams,
                    artifactStorage: params.artifactStorage,
                    memoryJournal: params.memoryJournal,
                    hierarchyStorage: params.hierarchyStorage,
                    config: params.config,
                    model: startParams.model,
                  })
                },
              },
              {
                appendRunEvent,
                updateRunSummary,
                incrementDelegationTurnCount,
                emitScheduleCreated: (payload) => eventBus.emit("schedule.created", payload),
                emitScheduleCancelled: (payload) => eventBus.emit("schedule.cancelled", payload),
                normalizeTaskProfile,
                releaseCanonicalSimplePath: async (descriptor) => {
                  const database = getDb()
                  const repository = new SqliteCanonicalWorkRepository(database, () => Date.now())
                  return releaseCanonicalSimplePath(descriptor, {
                    loadAggregate: (workId) => repository.load(workId),
                    deleteUnstartedAggregate: (workId) => {
                      const result = database
                        .prepare(`
                DELETE FROM canonical_work_aggregates
                WHERE work_id = ? AND state = 'REQUEST_RECEIVED' AND revision = 0
              `)
                        .run(workId)
                      return result.changes === 1
                    },
                  })
                },
                recordCanonicalIntakeDiagnosis: async (descriptor) => {
                  const database = getDb()
                  const workRepository = new SqliteCanonicalWorkRepository(
                    database,
                    () => Date.now(),
                  )
                  const receiptRepository = new SqliteCanonicalWorkReceiptRepository(
                    database,
                    () => Date.now(),
                  )
                  return recordCanonicalIntakeAnalysis(descriptor, {
                    loadAggregate: (workId) => workRepository.load(workId),
                    findLatestConsumedReceipt: (kind) =>
                      receiptRepository.findLatestConsumedByKind(descriptor.workId, kind),
                    recordDiagnosis: (diagnosisDescriptor) =>
                      recordCanonicalIntakeDiagnosis(diagnosisDescriptor, {
                        issueReceipt: (receipt) => receiptRepository.issue(receipt),
                        loadReceipt: (receiptId) => receiptRepository.load(receiptId),
                        applyDiagnosisTransition: ({ runId, workId, receiptRef }) => {
                          const cursor = resolveCanonicalTransitionCursor({
                            aggregate: workRepository.load(workId),
                            expectedState: "REQUEST_RECEIVED",
                          })
                          if (!cursor.ok) {
                            return { status: "rejected", reasonCode: cursor.reasonCode }
                          }
                          return applyCanonicalRunTransition({
                            runId,
                            workId,
                            expectedRevision: cursor.expectedRevision,
                            event: "DIAGNOSIS_ACCEPTED",
                            receiptRef,
                          })
                        },
                      }),
                    recordRevision: (revisionDescriptor, expectedRevision) =>
                      recordCanonicalAnalysisRevision(
                        revisionDescriptor,
                        expectedRevision,
                        {
                          issueReceipt: (receipt) => receiptRepository.issue(receipt),
                          loadReceipt: (receiptId) => receiptRepository.load(receiptId),
                          applyRevisionTransition: ({
                            runId,
                            workId,
                            expectedRevision: transitionRevision,
                            receiptRef,
                          }) =>
                            applyCanonicalRunTransition({
                              runId,
                              workId,
                              expectedRevision: transitionRevision,
                              event: "ANALYSIS_REVISED",
                              receiptRef,
                            }),
                        },
                      ),
                  })
                },
                authorizeCanonicalIntakePlan: async ({ runId, intake }) => {
                  const policy = buildCanonicalIntakePlanPolicy({
                    runId,
                    ...(params.capabilitySelection?.ownerAgentId
                      ? { rootAgentId: params.capabilitySelection.ownerAgentId }
                      : {}),
                    intake,
                    registry: canonicalPolicyRegistrySnapshot,
                    tools: canonicalPolicyTools,
                    source: params.source,
                    snapshotAt: params.canonicalPolicySnapshotAt,
                    runtimeHealthObservations: params.canonicalRuntimeHealthObservations,
                    yeonjangAgentBindings: params.canonicalYeonjangAgentBindings,
                  })
                  if (!policy.ok) {
                    if (!policy.decision || !policy.input) return policy
                    if (
                      policy.decision.outcome === "input_required" ||
                      policy.decision.outcome === "approval_required"
                    ) {
                      const waiting = buildCanonicalPolicyInputRequiredDescriptor({
                        runId,
                        reasonCode: policy.decision.reasonCode,
                        policyFingerprint: policy.input.capabilitySnapshot.fingerprint,
                        capabilityRefs: policy.decision.evaluatedCapabilityIds.map(
                          (capabilityId) => `capability:${capabilityId}`,
                        ),
                        waitingKind:
                          policy.decision.outcome === "approval_required"
                            ? "approval"
                            : "user_input",
                      })
                      if (!waiting.ok) return waiting
                      const recorded = await persistCanonicalFinalizationTransition(
                        waiting.descriptor,
                      )
                      return recorded.ok
                        ? {
                            ok: false,
                            reasonCode: `canonical_policy_${policy.decision.outcome}:${policy.reasonCode}`,
                          }
                        : recorded
                    }
                    return policy
                  }

                  const ownerAgentId =
                    params.capabilitySelection?.ownerAgentId ?? "agent:knowbee"
                  pendingCapabilityAdmissionContext = { policy, ownerAgentId }
                  const exclusiveMethods =
                    policy.input.constraints.exclusiveMethods
                  const preferredMethods =
                    policy.input.constraints.requestedMethods
                  const policyMethodNames =
                    exclusiveMethods.length > 0
                      ? exclusiveMethods
                      : preferredMethods
                  const requiresSolutionPlan =
                    intake.execution.needs_tools &&
                    (
                      policyMethodNames.length === 0 ||
                      intake.execution.execution_semantics.artifactDelivery === "direct"
                    )
                  if (policyMethodNames.length > 0 && !requiresSolutionPlan) {
                    const availableToolNames =
                      policy.input.capabilitySnapshot.bindings
                        .filter(
                          (binding) =>
                            binding.targetId === ownerAgentId &&
                            binding.risk !== "denied",
                        )
                        .map((binding) => binding.capabilityId)
                    const scopeResult = exclusiveMethods.length > 0
                      ? createPolicyCapabilityExecutionScope({
                          runId,
                          ownerAgentId,
                          policyReceiptId: policy.descriptor.receiptId,
                          capabilitySnapshotFingerprint:
                            policy.input.capabilitySnapshot.fingerprint,
                          toolNames: exclusiveMethods,
                        })
                      : createPolicyMethodCapabilityExecutionScope({
                          runId,
                          ownerAgentId,
                          policyReceiptId: policy.descriptor.receiptId,
                          capabilitySnapshotFingerprint:
                            policy.input.capabilitySnapshot.fingerprint,
                          methodToolNames: preferredMethods,
                          availableToolNames,
                          skillDefinitions:
                            params.capabilitySelection?.skillDefinitions ?? [],
                          skillBindings:
                            params.capabilitySelection?.skillBindings ?? [],
                        })
                    if (!scopeResult.ok) return scopeResult
                    admittedCapabilityExecutionScope = scopeResult.scope
                    appendRunEvent(
                      runId,
                      `capability_scope_admitted:source=policy_method;tools=${scopeResult.scope.toolNames.join(",")}`,
                    )
                  }

                  const receiptRepository = new SqliteCanonicalWorkReceiptRepository(getDb(), () =>
                    Date.now(),
                  )
                  const recordedPolicy = recordCanonicalIntakePlanPolicy(policy.descriptor, {
                    issueReceipt: (receipt) => receiptRepository.issue(receipt),
                    loadReceipt: (receiptId) => receiptRepository.load(receiptId),
                    applyPolicyTransition: ({ runId: transitionRunId, workId, receiptRef }) => {
                      const cursor = resolveCanonicalTransitionCursor({
                        aggregate: new SqliteCanonicalWorkRepository(
                          getDb(),
                          () => Date.now(),
                        ).load(workId),
                        expectedState: "SOLUTION_ANALYZED",
                      })
                      if (!cursor.ok) return { status: "rejected", reasonCode: cursor.reasonCode }
                      return applyCanonicalRunTransition({
                        runId: transitionRunId,
                        workId,
                        expectedRevision: cursor.expectedRevision,
                        event: "POLICY_ALLOWED",
                        receiptRef,
                      })
                    },
                  })
                  if (!recordedPolicy.ok) return recordedPolicy

                  if (requiresSolutionPlan) {
                    const runtimePlanning = params.solutionPlanning
                      ? {
                          status: "ready" as const,
                          solutionPlanProvider: params.solutionPlanning.provider,
                          solutionPlanRepairProvider:
                            params.solutionPlanning.repairProvider,
                          fieldDebugEvent:
                            "runtime_solution_plan_provider:ready:injected",
                        }
                      : createRuntimeSolutionPlanProvider({
                          provider: params.provider,
                          model: params.model,
                          workDir: params.workDir,
                          observabilityContext: {
                            runId,
                            requestGroupId: params.requestGroupId,
                            sessionId: params.sessionId,
                          },
                        })
                    appendRunEvent(runId, runtimePlanning.fieldDebugEvent)
                    if (runtimePlanning.status !== "ready") {
                      return {
                        ok: false,
                        reasonCode: `canonical_solution_plan_provider_${runtimePlanning.reasonCode}`,
                      }
                    }

                    const planningNow =
                      params.solutionPlanning?.now ?? (() => Date.now())
                    const requestDiagnosisIssuedAt = planningNow()
                    const issuedAt = Math.max(
                      planningNow(),
                      requestDiagnosisIssuedAt + 1,
                    )
                    const intakeDiagnosis =
                      buildCanonicalIntakeDiagnosisDescriptor({ runId, intake })
                    const ownerAgentName =
                      canonicalPolicyRegistrySnapshot.agents.find(
                        (agent) => agent.agentId === ownerAgentId,
                      )?.agentName ??
                      params.finalResponseIdentityContext?.mainAgentSelfName ??
                      "Knowbee"
                    const approvalCapabilityId =
                      intake.execution.execution_semantics.approvalTool
                    const approvalCapabilityAvailable =
                      policy.input.capabilitySnapshot.bindings.some(
                        (binding) =>
                          binding.capabilityId === approvalCapabilityId &&
                          binding.risk !== "denied",
                      )
                    const approvalCapabilityApproved =
                      policy.input.constraints.approvedCapabilityIds.includes(
                        approvalCapabilityId,
                      )
                    appendRunEvent(
                      runId,
                      `solution_plan_approval_capability:available=${approvalCapabilityAvailable};approved=${approvalCapabilityApproved}`,
                    )
                    const deliveryRequirement =
                      resolveChannelArtifactDeliveryRequirement({
                        required:
                          params.source === "telegram" &&
                          intake.execution.execution_semantics.artifactDelivery === "direct",
                        source: params.source,
                        destinationId: params.sessionId,
                        ownerAgentId,
                        tools: canonicalPolicyTools,
                      })
                    if (!deliveryRequirement.ok) return deliveryRequirement
                    const planned =
                      await planCanonicalSelfSolveCapabilities({
                        runId,
                        intake,
                        policy,
                        ownerAgentId,
                        ownerAgentName,
                        source: params.source,
                        destinationId: params.sessionId,
                        requestDiagnosisReceiptId:
                          intakeDiagnosis.receiptId,
                        requestDiagnosisIssuedAt,
                        issuedAt,
                        provider:
                          runtimePlanning.solutionPlanProvider,
                        capabilityMetadata: canonicalPolicyTools.map((tool) => ({
                          capabilityId: tool.name,
                          description: tool.description,
                          effectClass:
                            tool.sideEffect?.effectClass ?? "read_only",
                          ...(tool.channelCapability
                            ? {
                                channelCapability: {
                                  kind: tool.channelCapability.kind,
                                  channel: tool.channelCapability.channel,
                                },
                              }
                            : {}),
                        })),
                        ...(deliveryRequirement.requirement
                          ? {
                              artifactDeliveryRequirement:
                                deliveryRequirement.requirement,
                            }
                          : {}),
                        ...(runtimePlanning.solutionPlanRepairProvider
                          ? {
                              repairProvider:
                                runtimePlanning.solutionPlanRepairProvider,
                            }
                          : {}),
                        skillDefinitions:
                          params.capabilitySelection?.skillDefinitions ?? [],
                        skillBindings:
                          params.capabilitySelection?.skillBindings ?? [],
                        instructionSkills:
                          params.capabilitySelection?.instructionSkills ?? [],
                      })
                    if (!planned.ok) {
                      if (planned.repairFailureReasonCode) {
                        appendRunEvent(
                          runId,
                          `solution_plan_repair_failure_reason:${planned.repairFailureReasonCode}`,
                        )
                      }
                      return planned
                    }

                    const recordedAdmission =
                      recordSolutionPlanCapabilityAdmission(
                        planned.admission,
                        {
                          issueReceipt: (receipt) =>
                            receiptRepository.issue(receipt),
                          loadReceipt: (receiptId) =>
                            receiptRepository.load(receiptId),
                        },
                      )
                    if (!recordedAdmission.ok) return recordedAdmission
                    admittedCapabilityExecutionScope = planned.scope
                    appendRunEvent(
                      runId,
                      `capability_scope_admitted:source=solution_plan;tools=${planned.scope.toolNames.join(",")}`,
                    )
                    return {
                      ok: true,
                      requiredToolNames: [...planned.scope.toolNames],
                    }
                  }

                  return {
                    ok: true,
                    requiredToolNames: policyMethodNames,
                  }
                },
                recordCanonicalExecutionStart: async ({ runId, intake }) => {
                  const admission = buildCanonicalExecutionAdmissionDescriptor({
                    runId,
                    intake,
                    executorId: "agent:knowbee",
                    cancellationTokenId: `root-run:${runId}`,
                    signalAborted: params.controller.signal.aborted,
                  })
                  if (!admission.ok) return admission
                  const receiptRepository = new SqliteCanonicalWorkReceiptRepository(getDb(), () =>
                    Date.now(),
                  )
                  return recordCanonicalExecutionAdmission(admission.descriptor, {
                    issueReceipt: (receipt) => receiptRepository.issue(receipt),
                    loadReceipt: (receiptId) => receiptRepository.load(receiptId),
                    applyExecutionTransition: ({ runId: transitionRunId, workId, receiptRef }) => {
                      const cursor = resolveCanonicalTransitionCursor({
                        aggregate: new SqliteCanonicalWorkRepository(
                          getDb(),
                          () => Date.now(),
                        ).load(workId),
                        expectedState: "POLICY_VALIDATED",
                      })
                      if (!cursor.ok) return { status: "rejected", reasonCode: cursor.reasonCode }
                      return applyCanonicalRunTransition({
                        runId: transitionRunId,
                        workId,
                        expectedRevision: cursor.expectedRevision,
                        event: "EXECUTION_STARTED",
                        receiptRef,
                      })
                    },
                  })
                },
                recordExecutionDecisionTrace: ({
                  runId,
                  agentExecutionDecision,
                  executionDecisionTrace,
                }) => {
                  mergeRunPromptSourceSnapshot(runId, {
                    agentExecutionDecision,
                    executionDecisionSource: executionDecisionTrace.decision_source,
                    executionDecisionTrace,
                  })
                },
                logInfo: (message, payload) => {
                  params.logInfo(message, payload)
                },
              },
            ),
        },
        {
          logInfo: params.logInfo,
          logWarn: params.logWarn,
          logError: params.logError,
          appendRunEvent,
        },
      ),
    getSyntheticApprovalAlreadyApproved: (toolName) =>
      hasSyntheticApprovalScope(params.syntheticApprovalScopes, params.runId, toolName),
    onBootstrapInfo: (message, payload) => {
      params.logInfo(message, payload)
    },
    onFinally: () => {
      clearSyntheticApprovalScopes(params.syntheticApprovalScopes, params.runId)
      clearActiveRunController(params.runId)
    },
  }

  return {
    finalizationDependencies,
    syntheticApprovalRuntimeDependencies,
    driverDependencies,
  }
}
