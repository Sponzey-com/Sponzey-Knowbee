import type { RunChunkDeliveryHandler } from "./delivery.js"
import type { CompletionStageState } from "./completion-state.js"
import {
  completeRunWithAssistantMessage,
  markRunCompleted,
  type CanonicalDeliveryRecorder,
  type CanonicalPendingResponseConsumer,
  type CanonicalPendingResponseStager,
  type FinalizationDependencies,
  type FinalizationSource,
  type StandaloneAssistantMessageResponseContext,
} from "./finalization.js"
import { applyRecoveryRetryState, type RecoveryRetryApplicationDependencies } from "./retry-application.js"
import type { RecoveryBudgetUsage } from "./recovery-budget.js"
import type { NextAttemptToolPolicy } from "./next-attempt-tool-policy.js"
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js"
import type { CanonicalResultReportFacts } from "../contracts/canonical-result-report.js"
import { applyTerminalApplication } from "./terminal-application.js"
import {
  sanitizeCompletionAwaitingUserText,
  type CompletionApplicationDecision,
} from "./completion-application.js"
import { decideCompletionTerminalOutcome } from "./terminal-outcome-policy.js"
import {
  userFacingTextSourceRequiresFinalResponseReview,
  type UserFacingTextSource,
} from "./loop-directive.js"

export type CompletionApplicationPassResult =
  | { kind: "break" }
  | {
      kind: "retry"
      nextMessage: string
      clearWorkerRuntime: boolean
      structuredFollowupKey?: string
      markTruncatedOutputRecoveryAttempted?: boolean
      requiredToolNames?: string[]
      nextAttemptToolPolicy?: NextAttemptToolPolicy
    }

interface CompletionApplicationPassModuleDependencies {
  decideCompletionTerminalOutcome: typeof decideCompletionTerminalOutcome
  completeRunWithAssistantMessage?: typeof completeRunWithAssistantMessage
  markRunCompleted: typeof markRunCompleted
  applyTerminalApplication: typeof applyTerminalApplication
  applyRecoveryRetryState: typeof applyRecoveryRetryState
}

const defaultModuleDependencies: CompletionApplicationPassModuleDependencies = {
  decideCompletionTerminalOutcome,
  completeRunWithAssistantMessage,
  markRunCompleted,
  applyTerminalApplication,
  applyRecoveryRetryState,
}

function shouldFinalizeCompleteApplicationText(source: UserFacingTextSource | undefined): boolean {
  return source ? userFacingTextSourceRequiresFinalResponseReview(source) : false
}

function hasAppendedAwaitingUserText(params: {
  preview: string
  reason?: string | undefined
  remainingItems?: string[] | undefined
}): boolean {
  return Boolean(
    params.preview.trim()
      || params.reason?.trim()
      || params.remainingItems?.some((item) => item.trim()),
  )
}

function resolveAwaitingUserMessageSource(params: {
  explicitUserMessage: string
  preview: string
  reason?: string | undefined
  remainingItems?: string[] | undefined
}): UserFacingTextSource {
  if (!params.explicitUserMessage) return "runtime_deterministic"
  return hasAppendedAwaitingUserText(params) ? "mixed" : "llm_generated"
}

export async function applyCompletionApplicationPass(
  params: {
    runId: string
    sessionId: string
    source: FinalizationSource
    onChunk: RunChunkDeliveryHandler | undefined
    preview: string
    previewSource?: UserFacingTextSource
    deferredPreviewDelivery?: boolean
    state: CompletionStageState
    application: CompletionApplicationDecision
    responseContext?: StandaloneAssistantMessageResponseContext | undefined
    maxTurns: number
    recoveryBudgetUsage: RecoveryBudgetUsage
    finalizationDependencies: FinalizationDependencies
    recordCanonicalDelivery?: CanonicalDeliveryRecorder | undefined
    stageCanonicalPendingResponse?: CanonicalPendingResponseStager | undefined
    consumeCanonicalPendingResponse?: CanonicalPendingResponseConsumer | undefined
    canonicalFinalOutcome?: CanonicalFinalOutcome | undefined
    terminalReport?: CanonicalResultReportFacts | undefined
  },
  dependencies: RecoveryRetryApplicationDependencies,
  moduleDependencies: CompletionApplicationPassModuleDependencies = defaultModuleDependencies,
): Promise<CompletionApplicationPassResult> {
  if (params.application.kind === "complete") {
    const terminalOutcome = moduleDependencies.decideCompletionTerminalOutcome({
      state: params.state,
    })

    if (terminalOutcome.kind === "stop") {
      await moduleDependencies.applyTerminalApplication({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        application: {
          kind: "stop",
          preview: params.preview,
          summary: terminalOutcome.summary,
          reason: terminalOutcome.reason,
          userMessageSource: "runtime_deterministic",
          remainingItems: terminalOutcome.remainingItems,
        },
        ...(params.responseContext ? { responseContext: params.responseContext } : {}),
        ...(params.recordCanonicalDelivery
          ? {
              recordCanonicalDelivery: params.recordCanonicalDelivery,
              canonicalFinalOutcome: "succeeded" as const,
            }
          : {}),
        dependencies: params.finalizationDependencies,
      })
      return { kind: "break" }
    }

    if (
      params.deferredPreviewDelivery
      && (Boolean(params.recordCanonicalDelivery) || shouldFinalizeCompleteApplicationText(params.previewSource))
    ) {
      await (moduleDependencies.completeRunWithAssistantMessage ?? completeRunWithAssistantMessage)({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        text: params.application.persistedText,
        textSource: params.previewSource,
        ...(params.responseContext ? { responseContext: params.responseContext } : {}),
        ...(params.recordCanonicalDelivery
          ? {
              recordCanonicalDelivery: params.recordCanonicalDelivery,
              ...(params.stageCanonicalPendingResponse
                ? { stageCanonicalPendingResponse: params.stageCanonicalPendingResponse }
                : {}),
              ...(params.consumeCanonicalPendingResponse
                ? { consumeCanonicalPendingResponse: params.consumeCanonicalPendingResponse }
                : {}),
              canonicalFinalOutcome: "succeeded" as const,
            }
          : {}),
        dependencies: params.finalizationDependencies,
      })
      return { kind: "break" }
    }

    if (params.recordCanonicalDelivery) {
      throw new Error("Canonical completion cannot bypass final delivery.")
    }
    moduleDependencies.markRunCompleted({
      runId: params.runId,
      sessionId: params.sessionId,
      source: params.source,
      text: params.application.persistedText,
      summary: params.application.summary,
      reviewingSummary: params.application.summary,
      finalizingSummary: "실행 결과를 저장했습니다.",
      completedSummary: params.application.statusText,
      eventLabel: "실행 완료",
      dependencies: params.finalizationDependencies,
    })
    return { kind: "break" }
  }

  if (params.application.kind === "stop") {
    await moduleDependencies.applyTerminalApplication({
      runId: params.runId,
      sessionId: params.sessionId,
      source: params.source,
      onChunk: params.onChunk,
      application: {
        kind: "stop",
        preview: params.preview,
        summary: params.application.summary,
        userMessageSource: "runtime_deterministic",
        ...(params.application.reason ? { reason: params.application.reason } : {}),
        ...(params.application.remainingItems ? { remainingItems: params.application.remainingItems } : {}),
      },
      ...(params.responseContext ? { responseContext: params.responseContext } : {}),
      ...(params.recordCanonicalDelivery
        ? { recordCanonicalDelivery: params.recordCanonicalDelivery }
        : {}),
      ...(params.canonicalFinalOutcome
        ? { canonicalFinalOutcome: params.canonicalFinalOutcome }
        : {}),
      ...(params.terminalReport ? { terminalReport: params.terminalReport } : {}),
      dependencies: params.finalizationDependencies,
    })
    return { kind: "break" }
  }

  if (params.application.kind === "awaiting_user") {
    const summary = sanitizeCompletionAwaitingUserText(
      params.application.summary,
      "연장 작업 결과 확인이 더 필요합니다.",
    )
    const reason = params.application.reason
      ? sanitizeCompletionAwaitingUserText(
          params.application.reason,
          "연장 작업 결과 확인이 더 필요합니다.",
        )
      : undefined
    const remainingItems = params.application.remainingItems
      ?.map((item) => sanitizeCompletionAwaitingUserText(item, "사용자 확인이 필요합니다."))
      .filter((item) => item.trim().length > 0)
    const explicitUserMessage = params.application.userMessage
      ? sanitizeCompletionAwaitingUserText(params.application.userMessage).trim()
      : undefined
    const userMessageSource = resolveAwaitingUserMessageSource({
      explicitUserMessage: explicitUserMessage ?? "",
      preview: params.preview,
      ...(reason ? { reason } : {}),
      ...(remainingItems ? { remainingItems } : {}),
    })
    await moduleDependencies.applyTerminalApplication({
      runId: params.runId,
      sessionId: params.sessionId,
      source: params.source,
      onChunk: params.onChunk,
      application: {
        kind: "awaiting_user",
        preview: params.preview,
        summary,
        userMessageSource,
        ...(reason ? { reason } : {}),
        ...(remainingItems ? { remainingItems } : {}),
        ...(explicitUserMessage ? { userMessage: explicitUserMessage } : {}),
      },
      ...(params.responseContext ? { responseContext: params.responseContext } : {}),
      dependencies: params.finalizationDependencies,
    })
    return { kind: "break" }
  }

  const continuation = moduleDependencies.applyRecoveryRetryState({
    runId: params.runId,
    sessionId: params.sessionId,
    source: params.source,
    recoveryBudgetUsage: params.recoveryBudgetUsage,
    state: {
      summary: params.application.summary,
      budgetKind: params.application.budgetKind,
      maxDelegationTurns: params.maxTurns,
      eventLabel: params.application.eventLabel,
      nextMessage: params.application.nextMessage,
      reviewStepStatus: params.application.reviewStepStatus,
      executingStepSummary: params.application.executingStepSummary,
      ...(params.application.updateRunStatusSummary
        ? { updateRunStatusSummary: params.application.updateRunStatusSummary }
        : {}),
      ...(params.application.clearWorkerRuntime
        ? { clearWorkerRuntime: params.application.clearWorkerRuntime }
        : {}),
      ...(params.application.title ? { failureTitle: params.application.title } : {}),
      ...(params.application.detail ? { failureDetail: params.application.detail } : {}),
    },
  }, dependencies)

  return {
    kind: "retry",
    nextMessage: continuation.nextMessage,
    clearWorkerRuntime: continuation.clearWorkerRuntime,
    ...(params.application.structuredFollowupKey
      ? { structuredFollowupKey: params.application.structuredFollowupKey }
      : {}),
    ...(params.application.markTruncatedOutputRecoveryAttempted
      ? { markTruncatedOutputRecoveryAttempted: params.application.markTruncatedOutputRecoveryAttempted }
      : {}),
    ...(params.application.requiredToolNames !== undefined
      ? { requiredToolNames: params.application.requiredToolNames }
      : {}),
    ...(params.application.nextAttemptToolPolicy
      ? { nextAttemptToolPolicy: params.application.nextAttemptToolPolicy }
      : {}),
  }
}
