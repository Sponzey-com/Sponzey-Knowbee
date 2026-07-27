import type { AgentContextMode } from "../agent/index.js"
import type {
  TaskExecutionSemantics,
  TaskIntentEnvelope,
  TaskStructuredRequest,
} from "../agent/intake.js"
import type { insertMessage } from "../db/index.js"
import type { AIProvider } from "../ai/index.js"
import type { SyntheticApprovalRuntimeDependencies } from "./approval.js"
import type { RunChunkDeliveryHandler, logAssistantReply } from "./delivery.js"
import type { AgentAttributionSnapshot } from "../contracts/sub-agent-orchestration.js"
import type { SolutionPlanCapabilitySelection } from "../contracts/llm-solution-plan-provider.js"
import { createExecutionLoopRuntimeState } from "./execution-profile.js"
import {
  completeRunWithAssistantMessage,
  emitStandaloneAssistantMessage,
  type FinalizationDependencies,
  type FinalizationSource,
} from "./finalization.js"
import type { FinalResponseIdentityContext } from "./final-response-renderer.js"
import type { CanonicalRecoveryReentryRecorder } from "./execution-cycle-pass.js"
import type { CanonicalCompletionOutcomeRecorder } from "./review-outcome-pass.js"
import type { CanonicalDeliveryRecorder } from "./finalization.js"
import type { CanonicalPendingResponseConsumer, CanonicalPendingResponseStager } from "./finalization.js"
import type { LoopDirective } from "./loop-directive.js"
import { applyRootRunDriverFailure } from "./root-run-driver-failure.js"
import { prepareRootLoopLaunch } from "./root-loop-launch.js"
import { runRootLoop } from "./root-loop.js"
import type { ReconnectRequestGroupSelection } from "./store.js"
import type { TaskProfile } from "./types.js"
import type { WorkerRuntimeTarget } from "./worker-runtime.js"
import { redactLogText } from "../logger/index.js"
import { detectPrimaryMessageLanguage } from "../channels/language.js"
import type { KnowbeeConfig } from "../config/types.js"
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js"
import type { MemoryJournalRepository } from "../memory/journal.js"
import { createRuntimeDiagnosisProviderPair } from "./diagnosis-provider-runtime.js"
import { createRuntimeSolutionPlanProvider } from "./solution-plan-provider-runtime.js"
import {
  runTopologyRootRun,
  type TopologyRootRunExecutionResult,
  type TopologyRootRunRoutingDecision,
} from "../topology-runtime/harness.js"
import {
  buildCanonicalBlockedRuntimeReport,
  buildCanonicalPartialTopologyReport,
  buildCanonicalTopologyTerminalReport,
} from "./canonical-runtime-result-report.js"
import type { CanonicalTerminalEvidenceResult } from "./canonical-terminal-evidence.js"
import type { AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js"
import { CanonicalExecutionFailure } from "./canonical-execution-failure.js"

function reportLanguageForRequest(message: string): "ko" | "en" {
  return detectPrimaryMessageLanguage(message) === "ko" ? "ko" : "en"
}

function rootRunDriverErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export interface RootRunDriverDependencies {
  getAdmittedCapabilityExecutionScope: () => AdmittedCapabilityExecutionScope | undefined
  appendRunEvent: (runId: string, message: string) => void
  updateRunSummary: (runId: string, summary: string) => void
  setRunStepStatus: (
    runId: string,
    step: string,
    status: "pending" | "running" | "completed" | "failed" | "cancelled",
    summary: string,
  ) => void
  updateRunStatus: (
    runId: string,
    status:
      | "queued"
      | "running"
      | "awaiting_approval"
      | "awaiting_user"
      | "completed"
      | "failed"
      | "cancelled"
      | "interrupted",
    summary: string,
    active: boolean,
  ) => void
  rememberRunFailure: (params: {
    runId: string
    sessionId: string
    source: FinalizationSource
    summary: string
    detail?: string
    title?: string
  }) => void
  incrementDelegationTurnCount: (runId: string, summary: string) => void
  markAbortedRunCancelledIfActive: (runId: string) => void
  getDelegationTurnState: () => { usedTurns: number; maxTurns: number }
  getFinalizationDependencies: () => FinalizationDependencies
  insertMessage: typeof insertMessage
  writeReplyLog: typeof logAssistantReply
  createId: () => string
  now: () => number
  runVerificationSubtask: (params: {
    originalRequest: string
    mutationPaths: string[]
  }) => Promise<{ ok: boolean; summary: string; reason?: string; remainingItems?: string[] }>
  rememberRunApprovalScope: (runId: string, toolName: string) => void
  grantRunApprovalScope: (runId: string, toolName: string) => void
  grantRunSingleApproval: (runId: string, toolName: string) => void
  onDeliveryError?: (message: string) => void
  onReviewError?: (message: string) => void
  recordCanonicalAttempt: (input: {
    runId: string
    attempt: import("./execution-attempt-pass.js").ExecutionAttemptPassResult
    successfulToolNames: string[]
  }) => Promise<{ ok: true; evidenceRefs?: string[] } | { ok: false; reasonCode: string }>
  recordCanonicalRecoveryReentry: CanonicalRecoveryReentryRecorder
  recordCanonicalCompletionOutcome: CanonicalCompletionOutcomeRecorder
  recordCanonicalDelivery: CanonicalDeliveryRecorder
  stageCanonicalPendingResponse: CanonicalPendingResponseStager
  consumeCanonicalPendingResponse: CanonicalPendingResponseConsumer
  recordCanonicalCancellation: (input: {
    runId: string
    cancellationKind: "user_requested" | "runtime_abort"
    signalAborted: boolean
  }) => Promise<{ ok: true; receiptRef: string } | { ok: false; reasonCode: string }>
  getCanonicalTerminalOutcome: (
    runId: string,
  ) => "blocked" | "cancelled" | "user_input" | "approval" | null
  getCanonicalTerminalEvidence: (runId: string) => CanonicalTerminalEvidenceResult
  admitCanonicalTopologyExecution: (input: {
    runId: string
    route: Extract<TopologyRootRunRoutingDecision, { mode: "route" }>
    requestDiagnosisReceiptId: string
    solutionPlanReceiptId: string
    capabilitySelections: SolutionPlanCapabilitySelection[]
  }) => Promise<
    | { ok: true; capabilityAdmissionReceiptId?: string | undefined }
    | { ok: false; reasonCode: string }
  >
  recordCanonicalTopologyResult: (input: {
    runId: string
    result: TopologyRootRunExecutionResult
    resultDiagnosisReceiptId?: string | undefined
  }) => Promise<
    | { ok: true; finalOutcome?: "succeeded" | "partial" | "blocked" | "exhausted" | undefined }
    | { ok: false; reasonCode: string }
  >
  executeLoopDirective: (directive: LoopDirective) => Promise<"break">
  tryHandleActiveQueueCancellation: () => Promise<LoopDirective | null>
  tryHandleIntakeBridge: (params: {
    currentMessage: string
    originalRequest: string
  }) => Promise<LoopDirective | null>
  getSyntheticApprovalAlreadyApproved: (toolName: string) => boolean
  onBootstrapInfo?: (message: string, payload?: Record<string, unknown>) => void
  onFinally?: () => void
}

interface RootRunDriverModuleDependencies {
  createExecutionLoopRuntimeState: typeof createExecutionLoopRuntimeState
  prepareRootLoopLaunch: typeof prepareRootLoopLaunch
  runRootLoop: typeof runRootLoop
  applyRootRunDriverFailure: typeof applyRootRunDriverFailure
  runTopologyRootRun: typeof runTopologyRootRun
}

const defaultModuleDependencies: RootRunDriverModuleDependencies = {
  createExecutionLoopRuntimeState,
  prepareRootLoopLaunch,
  runRootLoop,
  applyRootRunDriverFailure,
  runTopologyRootRun,
}

export async function executeRootRunDriver(
  params: {
    artifactStorage: ArtifactStorageContext
    memoryJournal: MemoryJournalRepository
    runId: string
    sessionId: string
    requestGroupId: string
    source: FinalizationSource
    onChunk: RunChunkDeliveryHandler | undefined
    controller: AbortController
    message: string
    originalRequest?: string
    executionSemantics?: TaskExecutionSemantics
    structuredRequest?: TaskStructuredRequest
    intentEnvelope?: TaskIntentEnvelope
    currentModel: string | undefined
    currentProviderId: string | undefined
    currentProvider: AIProvider | undefined
    currentTargetId: string | undefined
    currentTargetLabel: string | undefined
    workDir: string
    config: KnowbeeConfig
    finalResponseIdentityContext?: FinalResponseIdentityContext | undefined
    skipIntake?: boolean
    immediateCompletionText?: string
    reconnectNeedsClarification: boolean
    reconnectTargetTitle?: string
    reconnectSelection?: ReconnectRequestGroupSelection
    queuedBehindRequestGroupRun: boolean
    activeWorkerRuntime: WorkerRuntimeTarget | undefined
    workerSessionId?: string
    toolsEnabled?: boolean
    isRootRequest: boolean
    suppressFinalDelivery?: boolean
    contextMode: AgentContextMode
    taskProfile: TaskProfile
    scheduleId?: string
    includeScheduleMemory?: boolean
    memorySearchQuery?: string
    topologyRouting?: TopologyRootRunRoutingDecision
    speaker?: AgentAttributionSnapshot
    syntheticApprovalRuntimeDependencies: SyntheticApprovalRuntimeDependencies
    defaultMaxDelegationTurns: number
  },
  dependencies: RootRunDriverDependencies,
  moduleDependencies: RootRunDriverModuleDependencies = defaultModuleDependencies,
): Promise<void> {
  const executionLoopRuntime = moduleDependencies.createExecutionLoopRuntimeState({
    message: params.message,
    ...(params.originalRequest ? { originalRequest: params.originalRequest } : {}),
    ...(params.executionSemantics ? { executionSemantics: params.executionSemantics } : {}),
    ...(params.structuredRequest ? { structuredRequest: params.structuredRequest } : {}),
    ...(params.intentEnvelope ? { intentEnvelope: params.intentEnvelope } : {}),
  })
  const prepareRootLoop = (skipIntake: boolean) =>
    moduleDependencies.prepareRootLoopLaunch(
      {
        artifactStorage: params.artifactStorage,
        memoryJournal: params.memoryJournal,
        runId: params.runId,
        sessionId: params.sessionId,
        requestGroupId: params.requestGroupId,
        source: params.source,
        onChunk: params.onChunk,
        controller: params.controller,
        message: params.message,
        currentModel: params.currentModel,
        currentProviderId: params.currentProviderId,
        currentProvider: params.currentProvider,
        currentTargetId: params.currentTargetId,
        currentTargetLabel: params.currentTargetLabel,
        workDir: params.workDir,
        config: params.config,
        ...(params.finalResponseIdentityContext
          ? { finalResponseIdentityContext: params.finalResponseIdentityContext }
          : {}),
        ...(skipIntake ? { skipIntake: true } : {}),
        ...(params.immediateCompletionText
          ? { immediateCompletionText: params.immediateCompletionText }
          : {}),
        reconnectNeedsClarification: params.reconnectNeedsClarification,
        ...(params.reconnectTargetTitle
          ? { reconnectTargetTitle: params.reconnectTargetTitle }
          : {}),
        ...(params.reconnectSelection ? { reconnectSelection: params.reconnectSelection } : {}),
        queuedBehindRequestGroupRun: params.queuedBehindRequestGroupRun,
        activeWorkerRuntime: params.activeWorkerRuntime,
        ...(params.workerSessionId ? { workerSessionId: params.workerSessionId } : {}),
        ...(params.toolsEnabled === false ? { toolsEnabled: false } : {}),
        isRootRequest: params.isRootRequest,
        contextMode: params.contextMode,
        taskProfile: params.taskProfile,
        ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
        ...(params.includeScheduleMemory ? { includeScheduleMemory: true } : {}),
        ...(params.memorySearchQuery ? { memorySearchQuery: params.memorySearchQuery } : {}),
        syntheticApprovalRuntimeDependencies: params.syntheticApprovalRuntimeDependencies,
        defaultMaxDelegationTurns: params.defaultMaxDelegationTurns,
      },
      dependencies,
      executionLoopRuntime,
    )

  try {
    await new Promise<void>((resolve) => setImmediate(resolve))
    let topologyFallbackAdmitted = false
    if (params.topologyRouting?.mode === "route") {
      const topologyExecution = await executeTopologyRuntimeOrFallback(
        {
          runId: params.runId,
          sessionId: params.sessionId,
          source: params.source,
          onChunk: params.onChunk,
          message: params.message,
          ...(executionLoopRuntime.executionProfile.structuredRequest?.response_language_mode
            ? {
                responseLanguageMode:
                  executionLoopRuntime.executionProfile.structuredRequest.response_language_mode,
              }
            : {}),
          model: params.currentModel,
          ...(params.currentProviderId ? { providerId: params.currentProviderId } : {}),
          ...(params.currentProvider ? { provider: params.currentProvider } : {}),
          config: params.config,
          workDir: params.workDir,
          ...(params.finalResponseIdentityContext
            ? { finalResponseIdentityContext: params.finalResponseIdentityContext }
            : {}),
          topologyRouting: params.topologyRouting,
          ...(params.speaker ? { speaker: params.speaker } : {}),
          ...(params.suppressFinalDelivery ? { suppressFinalDelivery: true } : {}),
        },
        dependencies,
        moduleDependencies,
      )
      if (topologyExecution.ok) return
      if (topologyExecution.reasonCode === "topology_runtime_terminal_stop") return
      if (topologyExecution.reasonCode === "planning_admission_blocked") {
        topologyFallbackAdmitted = true
      } else {
        const canonicalRecovery = await dependencies.recordCanonicalRecoveryReentry({
          runId: params.runId,
          previousResult: topologyExecution.fallbackSummary,
          strategy: {
            message: params.message,
            ...(params.currentModel ? { model: params.currentModel } : {}),
            ...(params.currentProviderId ? { providerId: params.currentProviderId } : {}),
            targetId: "agent:knowbee",
            ...(params.activeWorkerRuntime?.kind
              ? { workerRuntimeKind: params.activeWorkerRuntime.kind }
              : {}),
          },
        })
        if (!canonicalRecovery.ok) {
          throw new CanonicalExecutionFailure({
            phase: "topology",
            reasonCode: canonicalRecovery.reasonCode,
            retryable: true,
          })
        }
        topologyFallbackAdmitted = true
      }
    }
    const rootLoopLaunch = prepareRootLoop(Boolean(params.skipIntake) || topologyFallbackAdmitted)
    await moduleDependencies.runRootLoop(
      rootLoopLaunch.rootLoopParams,
      rootLoopLaunch.rootLoopDependencies,
    )
  } catch (error) {
    const message = rootRunDriverErrorMessage(error)
    let canonicalReportDelivered = false
    const canonicalOutcome = dependencies.getCanonicalTerminalOutcome(params.runId)
    if (params.controller.signal.aborted) {
      const cancellation = await dependencies.recordCanonicalCancellation({
        runId: params.runId,
        cancellationKind: "runtime_abort",
        signalAborted: true,
      })
      if (!cancellation.ok) {
        dependencies.appendRunEvent(
          params.runId,
          `canonical_cancellation_transition_rejected:${cancellation.reasonCode}`,
        )
      } else if (!params.suppressFinalDelivery) {
        const finalization = await completeRunWithAssistantMessage({
          runId: params.runId,
          sessionId: params.sessionId,
          text: "The requested execution was cancelled.",
          textSource: "runtime_deterministic",
          responseContext: {
            originalRequest: params.message,
            model: params.currentModel,
            ...(params.currentProviderId ? { providerId: params.currentProviderId } : {}),
            ...(params.currentProvider ? { provider: params.currentProvider } : {}),
            config: params.config,
            workDir: params.workDir,
            ...(params.finalResponseIdentityContext
              ? { identityContext: params.finalResponseIdentityContext }
              : {}),
          },
          source: params.source,
          onChunk: params.onChunk,
          recordCanonicalDelivery: dependencies.recordCanonicalDelivery,
          stageCanonicalPendingResponse: dependencies.stageCanonicalPendingResponse,
          consumeCanonicalPendingResponse: dependencies.consumeCanonicalPendingResponse,
          canonicalFinalOutcome: "cancelled",
          cancellationReportAuthorization: {
            runId: params.runId,
            finalOutcome: "cancelled",
            receiptRef: cancellation.receiptRef,
          },
          preserveRunStatusAfterDelivery: true,
          dependencies: dependencies.getFinalizationDependencies(),
        })
        canonicalReportDelivered = finalization.status === "completed"
      }
    } else if (canonicalOutcome === "blocked") {
      const terminalEvidence = dependencies.getCanonicalTerminalEvidence(params.runId)
      if (terminalEvidence.status !== "available") {
        dependencies.appendRunEvent(
          params.runId,
          `canonical_blocked_terminal_evidence_rejected:${terminalEvidence.reasonCode}`,
        )
      } else {
        const finalization = await completeRunWithAssistantMessage({
          runId: params.runId,
          sessionId: params.sessionId,
          text: "The request reached a verified blocked outcome.",
          textSource: "runtime_deterministic",
          responseContext: {
            originalRequest: params.message,
            model: params.currentModel,
            ...(params.currentProviderId ? { providerId: params.currentProviderId } : {}),
            ...(params.currentProvider ? { provider: params.currentProvider } : {}),
            config: params.config,
            workDir: params.workDir,
            ...(params.finalResponseIdentityContext
              ? { identityContext: params.finalResponseIdentityContext }
              : {}),
          },
          source: params.source,
          onChunk: params.onChunk,
          recordCanonicalDelivery: dependencies.recordCanonicalDelivery,
          stageCanonicalPendingResponse: dependencies.stageCanonicalPendingResponse,
          consumeCanonicalPendingResponse: dependencies.consumeCanonicalPendingResponse,
          canonicalFinalOutcome: "blocked",
          terminalReport: buildCanonicalBlockedRuntimeReport({
            primaryLanguage: reportLanguageForRequest(params.message),
            terminalEvidence,
          }),
          preserveRunStatusAfterDelivery: true,
          dependencies: dependencies.getFinalizationDependencies(),
        })
        canonicalReportDelivered = finalization.status === "completed"
      }
    } else if (canonicalOutcome === "user_input" || canonicalOutcome === "approval") {
      if (!params.suppressFinalDelivery) {
        await emitStandaloneAssistantMessage({
          runId: params.runId,
          sessionId: params.sessionId,
          text: canonicalOutcome === "approval"
            ? "Approval is required before the requested execution can continue."
            : "Additional user input is required before the requested execution can continue.",
          textSource: "runtime_deterministic",
          notice: {
            kind: canonicalOutcome === "approval" ? "approval_required" : "user_input_required",
            textSource: "runtime_deterministic",
            renderingRequired: "llm_final_response",
            finalAnswer: false,
            assistantIdentityClaim: false,
          },
          responseContext: {
            originalRequest: params.message,
            model: params.currentModel,
            ...(params.currentProviderId ? { providerId: params.currentProviderId } : {}),
            ...(params.currentProvider ? { provider: params.currentProvider } : {}),
            config: params.config,
            workDir: params.workDir,
            ...(params.finalResponseIdentityContext
              ? { identityContext: params.finalResponseIdentityContext }
              : {}),
          },
          source: params.source,
          onChunk: params.onChunk,
          dependencies: dependencies.getFinalizationDependencies(),
        })
      }
      return
    }
    if (canonicalReportDelivered) return
    await moduleDependencies.applyRootRunDriverFailure(
      {
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        aborted: params.controller.signal.aborted,
        failure: error instanceof CanonicalExecutionFailure ? error : new Error(message),
        message,
        responseContext: {
          originalRequest: params.originalRequest ?? params.message,
          model: params.currentModel,
          ...(params.currentProviderId ? { providerId: params.currentProviderId } : {}),
          ...(params.currentProvider ? { provider: params.currentProvider } : {}),
          config: params.config,
          workDir: params.workDir,
          ...(params.finalResponseIdentityContext
            ? { identityContext: params.finalResponseIdentityContext }
            : {}),
        },
      },
      {
        appendRunEvent: dependencies.appendRunEvent,
        setRunStepStatus: dependencies.setRunStepStatus,
        updateRunStatus: dependencies.updateRunStatus,
        rememberRunFailure: dependencies.rememberRunFailure,
        markAbortedRunCancelledIfActive: dependencies.markAbortedRunCancelledIfActive,
        finalizationDependencies: dependencies.getFinalizationDependencies(),
        ...(dependencies.onDeliveryError ? { onDeliveryError: dependencies.onDeliveryError } : {}),
      },
    )
  } finally {
    dependencies.onFinally?.()
  }
}

async function executeTopologyRuntimeOrFallback(
  params: {
    runId: string
    sessionId: string
    source: FinalizationSource
    onChunk: RunChunkDeliveryHandler | undefined
    message: string
    responseLanguageMode?: TaskStructuredRequest["response_language_mode"]
    model: string | undefined
    providerId?: string | undefined
    provider?: AIProvider | undefined
    config: KnowbeeConfig
    workDir: string
    finalResponseIdentityContext?: FinalResponseIdentityContext | undefined
    topologyRouting: Extract<TopologyRootRunRoutingDecision, { mode: "route" }>
    speaker?: AgentAttributionSnapshot
    suppressFinalDelivery?: boolean
  },
  dependencies: RootRunDriverDependencies,
  moduleDependencies: RootRunDriverModuleDependencies,
): Promise<TopologyRootRunExecutionResult> {
  const selectedExecutorLabel = params.topologyRouting.selectedExecutorId ?? "unselected"
  dependencies.appendRunEvent(
    params.runId,
    `topology_runtime_selected:${params.topologyRouting.topologyId}@${params.topologyRouting.topologyVersion}:selected=${selectedExecutorLabel}`,
  )
  dependencies.setRunStepStatus(
    params.runId,
    "planning",
    "running",
    "LLM diagnosis and solution planning are in progress.",
  )
  dependencies.updateRunSummary(params.runId, "Enterprise Topology LLM 계획 수립 중")
  const diagnosisProviderResolution = createRuntimeDiagnosisProviderPair({
    provider: params.provider,
    model: params.model,
    workDir: params.workDir,
    observabilityContext: { runId: params.runId, sessionId: params.sessionId },
  })
  dependencies.appendRunEvent(params.runId, diagnosisProviderResolution.fieldDebugEvent)
  const solutionPlanProviderResolution = createRuntimeSolutionPlanProvider({
    provider: params.provider,
    model: params.model,
    workDir: params.workDir,
    observabilityContext: { runId: params.runId, sessionId: params.sessionId },
  })
  dependencies.appendRunEvent(params.runId, solutionPlanProviderResolution.fieldDebugEvent)
  let resultDiagnosisReceiptId: string | undefined
  const execution = await moduleDependencies.runTopologyRootRun({
    decision: params.topologyRouting,
    runId: params.runId,
    sessionId: params.sessionId,
    source: params.source,
    message: params.message,
    planningAdmission: {
      required: true,
      ...(diagnosisProviderResolution.status === "ready"
        ? {
            diagnosisProvider: diagnosisProviderResolution.diagnosisProvider,
          }
        : {}),
      ...(solutionPlanProviderResolution.status === "ready"
        ? {
            solutionPlanProvider: solutionPlanProviderResolution.solutionPlanProvider,
          }
        : {}),
    },
    onPlanningAdmitted: async ({
      requestDiagnosisReceiptId,
      solutionPlanReceiptId,
      capabilitySelections,
    }) => {
      const persisted = await dependencies.admitCanonicalTopologyExecution({
        runId: params.runId,
        route: params.topologyRouting,
        requestDiagnosisReceiptId,
        solutionPlanReceiptId,
        capabilitySelections,
      })
      if (!persisted.ok) return persisted
      dependencies.appendRunEvent(
        params.runId,
        "topology_planning_admitted",
      )
      dependencies.setRunStepStatus(
        params.runId,
        "executing",
        "running",
        "The admitted LLM solution plan is being executed.",
      )
      dependencies.updateRunSummary(params.runId, "Enterprise Topology runtime 실행 중")
      return { ok: true }
    },
    resultDiagnosisAdmission: {
      required: true,
      ...(diagnosisProviderResolution.status === "ready"
        ? {
            diagnosisProvider: diagnosisProviderResolution.diagnosisProvider,
          }
        : {}),
    },
    onResultDiagnosed: ({ resultDiagnosisReceiptId: receiptId }) => {
      resultDiagnosisReceiptId = receiptId
      return { ok: true }
    },
    ...(diagnosisProviderResolution.status === "ready"
      ? {
          diagnosisProvider: diagnosisProviderResolution.diagnosisProvider,
        }
      : {}),
  })
  if (!execution.ok && execution.reasonCode === "planning_admission_blocked") {
    dependencies.appendRunEvent(params.runId, "topology_planning_reanalysis_required")
    dependencies.updateRunSummary(params.runId, execution.fallbackSummary)
    return execution
  }
  const canonicalResult = await dependencies.recordCanonicalTopologyResult({
    runId: params.runId,
    result: execution,
    ...(resultDiagnosisReceiptId ? { resultDiagnosisReceiptId } : {}),
  })
  if (!canonicalResult.ok) {
    throw new CanonicalExecutionFailure({
      phase: "topology",
      reasonCode: canonicalResult.reasonCode,
      retryable: false,
    })
  }
  const terminalStopDecision = execution.runtimeResult?.terminalStopDecision
  if (!execution.ok && terminalStopDecision !== undefined) {
    if (canonicalResult.finalOutcome !== "blocked" && canonicalResult.finalOutcome !== "exhausted") {
      throw new Error("Canonical topology terminal outcome was not recorded.")
    }
    dependencies.appendRunEvent(
      params.runId,
      `topology_runtime_terminal_stop:${terminalStopDecision.reasonCode}`,
    )
    await completeRunWithAssistantMessage({
      runId: params.runId,
      sessionId: params.sessionId,
      text: "The requested outcome could not be completed after all verified solution paths were evaluated.",
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: params.message,
        ...(params.responseLanguageMode ? { responseLanguageMode: params.responseLanguageMode } : {}),
        model: params.model,
        ...(params.providerId ? { providerId: params.providerId } : {}),
        ...(params.provider ? { provider: params.provider } : {}),
        config: params.config,
        workDir: params.workDir,
        ...(params.finalResponseIdentityContext
          ? { identityContext: params.finalResponseIdentityContext }
          : {}),
      },
      source: params.source,
      onChunk: params.onChunk,
      ...(params.speaker ? { speaker: params.speaker } : {}),
      ...(!params.suppressFinalDelivery
        ? {
            recordCanonicalDelivery: dependencies.recordCanonicalDelivery,
            stageCanonicalPendingResponse: dependencies.stageCanonicalPendingResponse,
            consumeCanonicalPendingResponse: dependencies.consumeCanonicalPendingResponse,
            canonicalFinalOutcome: canonicalResult.finalOutcome,
            terminalReport: buildCanonicalTopologyTerminalReport({
              runId: params.runId,
              primaryLanguage: reportLanguageForRequest(params.message),
              decision: terminalStopDecision,
            }),
          }
        : {
            suppressFinalDelivery: true,
            suppressFinalDeliveryReasonCode: "child_result_parent_aggregation_required",
          }),
      dependencies: dependencies.getFinalizationDependencies(),
    })
    return execution
  }
  if (!execution.ok) {
    dependencies.appendRunEvent(params.runId, `topology_runtime_fallback:${execution.reasonCode}`)
    dependencies.updateRunSummary(params.runId, execution.fallbackSummary)
    return execution
  }

  dependencies.appendRunEvent(
    params.runId,
    `topology_runtime_completed:${execution.topologyRunId}:selected=${selectedExecutorLabel}`,
  )
  await completeRunWithAssistantMessage({
    runId: params.runId,
    sessionId: params.sessionId,
    text: execution.finalAnswer,
    textSource: "runtime_deterministic",
    responseContext: {
      originalRequest: params.message,
      ...(params.responseLanguageMode ? { responseLanguageMode: params.responseLanguageMode } : {}),
      model: params.model,
      ...(params.providerId ? { providerId: params.providerId } : {}),
      ...(params.provider ? { provider: params.provider } : {}),
      config: params.config,
      workDir: params.workDir,
      ...(params.finalResponseIdentityContext
        ? { identityContext: params.finalResponseIdentityContext }
        : {}),
    },
    source: params.source,
    onChunk: params.onChunk,
    ...(params.speaker ? { speaker: params.speaker } : {}),
    ...(!params.suppressFinalDelivery
      ? {
          recordCanonicalDelivery: dependencies.recordCanonicalDelivery,
          stageCanonicalPendingResponse: dependencies.stageCanonicalPendingResponse,
          consumeCanonicalPendingResponse: dependencies.consumeCanonicalPendingResponse,
          ...(canonicalResult.finalOutcome
            ? {
                canonicalFinalOutcome: canonicalResult.finalOutcome,
                ...(canonicalResult.finalOutcome === "partial"
                  ? {
                      terminalReport: buildCanonicalPartialTopologyReport({
                        runId: params.runId,
                        primaryLanguage: reportLanguageForRequest(params.message),
                        report: execution.nodeResultReport,
                      }),
                    }
                  : {}),
              }
            : {}),
        }
      : {}),
    ...(params.suppressFinalDelivery
      ? {
          suppressFinalDelivery: true,
          suppressFinalDeliveryReasonCode: "child_result_parent_aggregation_required",
        }
      : {}),
    dependencies: dependencies.getFinalizationDependencies(),
  })
  return execution
}
