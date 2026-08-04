import type { ExecutionCycleState, runExecutionCyclePass } from "./execution-cycle-pass.js"
import type { LoopDirective } from "./loop-directive.js"
import type { runLoopEntryPass } from "./loop-entry-pass.js"
import type { RootLoopDependencies, RootLoopParams } from "./root-loop.js"
import { buildStructuredExecutionBrief } from "./request-prompt.js"
import { resolveCapabilityScopedArtifactDeliverySemantics } from "./execution-profile.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"
import type { FinalResponseIdentityContext } from "./final-response-renderer.js"

export interface RootLoopEntryPassLaunch {
  params: Parameters<typeof runLoopEntryPass>[0]
  dependencies: Parameters<typeof runLoopEntryPass>[1]
}

export interface RootExecutionCyclePassLaunch {
  params: Parameters<typeof runExecutionCyclePass>[0]
  dependencies: Parameters<typeof runExecutionCyclePass>[1]
}

export function prepareRootLoopEntryPassLaunch(
  params: {
    runId: string
    sessionId: string
    source: RootLoopParams["source"]
    onChunk: RootLoopParams["onChunk"]
    pendingLoopDirective: LoopDirective | null
    intakeProcessed: boolean
    currentMessage: string
    recoveryBudgetUsage: RootLoopParams["recoveryBudgetUsage"]
  },
  dependencies: RootLoopDependencies,
): RootLoopEntryPassLaunch {
  return {
    params: {
      runId: params.runId,
      sessionId: params.sessionId,
      source: params.source,
      onChunk: params.onChunk,
      pendingLoopDirective: params.pendingLoopDirective,
      intakeProcessed: params.intakeProcessed,
      recoveryBudgetUsage: params.recoveryBudgetUsage,
      finalizationDependencies: dependencies.getFinalizationDependencies(),
    },
    dependencies: {
      rememberRunFailure: dependencies.rememberRunFailure,
      incrementDelegationTurnCount: dependencies.incrementDelegationTurnCount,
      appendRunEvent: dependencies.appendRunEvent,
      setRunStepStatus: dependencies.setRunStepStatus,
      updateRunStatus: dependencies.updateRunStatus,
      getDelegationTurnState: dependencies.getDelegationTurnState,
      executeLoopDirective: dependencies.executeLoopDirective,
      tryHandleActiveQueueCancellation: dependencies.tryHandleActiveQueueCancellation,
      tryHandleIntakeBridge: () => dependencies.tryHandleIntakeBridge(params.currentMessage),
    },
  }
}

export function prepareRootExecutionCyclePassLaunch(
  params: {
    artifactStorage: RootLoopParams["artifactStorage"]
    memoryJournal: RootLoopParams["memoryJournal"]
    runId: string
    sessionId: string
    requestGroupId: string
    source: RootLoopParams["source"]
    onChunk: RootLoopParams["onChunk"]
    signal: AbortSignal
    abortExecutionStream: () => void
    state: ExecutionCycleState
    executionSemantics: RootLoopParams["executionSemantics"]
    originalRequest: string
    structuredRequest?: RootLoopParams["structuredRequest"]
    requestMessage: string
    workDir: string
    config: RootLoopParams["config"]
    finalResponseIdentityContext?: FinalResponseIdentityContext | undefined
    toolsEnabled?: boolean
    workerSessionId?: string
    isRootRequest: boolean
    contextMode: RootLoopParams["contextMode"]
    taskProfile: RootLoopParams["taskProfile"]
    scheduleId?: string
    includeScheduleMemory?: boolean
    memorySearchQuery?: string
    wantsDirectArtifactDelivery: boolean
    requiresFilesystemMutation: boolean
    requiresPrivilegedToolExecution: boolean
    pendingToolParams: RootLoopParams["pendingToolParams"]
    filesystemMutationPaths: RootLoopParams["filesystemMutationPaths"]
    seenFollowupPrompts: RootLoopParams["seenFollowupPrompts"]
    seenCommandFailureRecoveryKeys: RootLoopParams["seenCommandFailureRecoveryKeys"]
    seenExecutionRecoveryKeys: RootLoopParams["seenExecutionRecoveryKeys"]
    seenDeliveryRecoveryKeys: RootLoopParams["seenDeliveryRecoveryKeys"]
    seenAiRecoveryKeys: RootLoopParams["seenAiRecoveryKeys"]
    recoveryBudgetUsage: RootLoopParams["recoveryBudgetUsage"]
    priorAssistantMessages: RootLoopParams["priorAssistantMessages"]
    syntheticApprovalRuntimeDependencies: RootLoopParams["syntheticApprovalRuntimeDependencies"]
    defaultMaxDelegationTurns: number
  },
  dependencies: RootLoopDependencies,
): RootExecutionCyclePassLaunch {
  const executionMessage =
    params.structuredRequest && params.state.currentMessage === params.requestMessage
      ? buildStructuredExecutionBrief({
          header: loadPromptValue("root_execution_header_user"),
          introLines: [loadPromptValue("root_execution_intake_complete_intro_user")],
          originalRequest: params.originalRequest,
          structuredRequest: params.structuredRequest,
          executionSemantics: params.executionSemantics,
          closingLines: [
            loadPromptValue("root_execution_checklist_order_closing_user"),
            loadPromptValue("root_execution_incomplete_checklist_closing_user"),
          ],
        })
      : params.state.currentMessage
  const admittedCapabilityExecutionScope =
    dependencies.getAdmittedCapabilityExecutionScope?.()
  const effectiveExecutionSemantics = resolveCapabilityScopedArtifactDeliverySemantics({
    source: params.source,
    executionSemantics: params.executionSemantics,
    ...(admittedCapabilityExecutionScope
      ? { admittedCapabilityExecutionScope }
      : {}),
  })

  return {
    params: {
      artifactStorage: params.artifactStorage,
      memoryJournal: params.memoryJournal,
      runId: params.runId,
      sessionId: params.sessionId,
      requestGroupId: params.requestGroupId,
      source: params.source,
      onChunk: params.onChunk,
      signal: params.signal,
      state: {
        ...params.state,
        currentMessage: executionMessage,
      },
      executionSemantics: effectiveExecutionSemantics,
      originalRequest: params.originalRequest,
      ...(params.structuredRequest?.response_language_mode
        ? { responseLanguageMode: params.structuredRequest.response_language_mode }
        : {}),
      memorySearchQuery: params.memorySearchQuery ?? params.requestMessage,
      ...(admittedCapabilityExecutionScope
        ? {
            admittedCapabilityExecutionScope,
          }
        : {}),
      ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
      ...(params.includeScheduleMemory ? { includeScheduleMemory: true } : {}),
      verificationRequest: params.requestMessage,
      workDir: params.workDir,
      config: params.config,
      ...(params.finalResponseIdentityContext
        ? { finalResponseIdentityContext: params.finalResponseIdentityContext }
        : {}),
      ...(params.toolsEnabled === false ? { toolsEnabled: false } : {}),
      ...(dependencies.onDeliveryError ? { onDeliveryError: dependencies.onDeliveryError } : {}),
      abortExecutionStream: params.abortExecutionStream,
      isRootRequest: params.isRootRequest,
      contextMode: params.contextMode,
      taskProfile: params.taskProfile,
      ...(params.workerSessionId ? { workerSessionId: params.workerSessionId } : {}),
      wantsDirectArtifactDelivery:
        effectiveExecutionSemantics.artifactDelivery === "direct",
      requiresFilesystemMutation: params.requiresFilesystemMutation,
      requiresPrivilegedToolExecution: params.requiresPrivilegedToolExecution,
      pendingToolParams: params.pendingToolParams,
      filesystemMutationPaths: params.filesystemMutationPaths,
      successfulTools: params.state.successfulTools,
      completionConditions: params.structuredRequest?.complete_condition ?? [],
      seenFollowupPrompts: params.seenFollowupPrompts,
      seenCommandFailureRecoveryKeys: params.seenCommandFailureRecoveryKeys,
      seenExecutionRecoveryKeys: params.seenExecutionRecoveryKeys,
      seenDeliveryRecoveryKeys: params.seenDeliveryRecoveryKeys,
      seenAiRecoveryKeys: params.seenAiRecoveryKeys,
      recoveryBudgetUsage: params.recoveryBudgetUsage,
      priorAssistantMessages: params.priorAssistantMessages,
      syntheticApprovalAlreadyApproved: dependencies.getSyntheticApprovalAlreadyApproved(
        params.executionSemantics.approvalTool,
      ),
      syntheticApprovalRuntimeDependencies: params.syntheticApprovalRuntimeDependencies,
      defaultMaxDelegationTurns: params.defaultMaxDelegationTurns,
    },
    dependencies: {
      rememberRunFailure: dependencies.rememberRunFailure,
      incrementDelegationTurnCount: dependencies.incrementDelegationTurnCount,
      appendRunEvent: dependencies.appendRunEvent,
      updateRunSummary: dependencies.updateRunSummary,
      setRunStepStatus: dependencies.setRunStepStatus,
      updateRunStatus: dependencies.updateRunStatus,
      markAbortedRunCancelledIfActive: dependencies.markAbortedRunCancelledIfActive,
      getDelegationTurnState: dependencies.getDelegationTurnState,
      getFinalizationDependencies: dependencies.getFinalizationDependencies,
      insertMessage: dependencies.insertMessage,
      writeReplyLog: dependencies.writeReplyLog,
      createId: dependencies.createId,
      now: dependencies.now,
      runVerificationSubtask: dependencies.runVerificationSubtask,
      rememberRunApprovalScope: dependencies.rememberRunApprovalScope,
      grantRunApprovalScope: dependencies.grantRunApprovalScope,
      grantRunSingleApproval: dependencies.grantRunSingleApproval,
      ...(dependencies.onReviewError ? { onReviewError: dependencies.onReviewError } : {}),
      recordCanonicalAttempt: dependencies.recordCanonicalAttempt,
      recordCanonicalRecoveryReentry: dependencies.recordCanonicalRecoveryReentry,
      recordCanonicalCompletionOutcome: dependencies.recordCanonicalCompletionOutcome,
      recordCanonicalDelivery: dependencies.recordCanonicalDelivery,
      stageCanonicalPendingResponse: dependencies.stageCanonicalPendingResponse,
      consumeCanonicalPendingResponse: dependencies.consumeCanonicalPendingResponse,
    },
  }
}
