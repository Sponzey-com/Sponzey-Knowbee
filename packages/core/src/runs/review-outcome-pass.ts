import {
  buildCompletionReviewContextReceipt,
  buildCompletionReviewExpectedConditions,
  type CompletionReviewOperationalEvidence,
  type CompletionReviewResult,
} from "../agent/completion-review.js"
import type { TaskExecutionSemantics } from "../agent/intake.js"
import type { DeliveryOutcome, RunChunkDeliveryHandler } from "./delivery.js"
import type {
  CanonicalDeliveryRecorder,
  CanonicalPendingResponseConsumer,
  CanonicalPendingResponseStager,
  FinalizationDependencies,
  FinalizationSource,
  StandaloneAssistantMessageResponseContext,
} from "./finalization.js"
import type { UserFacingTextSource } from "./loop-directive.js"
import type { RecoveryBudgetUsage } from "./recovery-budget.js"
import type { SuccessfulToolEvidence } from "./recovery.js"
import type { SyntheticApprovalRequest, SyntheticApprovalRuntimeDependencies } from "./approval.js"
import { applySyntheticApprovalContinuation } from "./approval-application.js"
import { runSyntheticApprovalPass } from "./approval-pass.js"
import { applyCompletionApplicationPass, type CompletionApplicationPassResult } from "./completion-application-pass.js"
import { runCompletionPass } from "./completion-pass.js"
import { buildStructuredFollowupKey } from "./completion-application.js"
import {
  buildCanonicalCompletionOutcomeDescriptor,
  type CanonicalFinalizationTransitionDescriptor,
} from "./canonical-finalization-lifecycle.js"
import { CanonicalExecutionFailure } from "./canonical-execution-failure.js"
import type { NextAttemptToolPolicy } from "./next-attempt-tool-policy.js"
import {
  buildCanonicalCompletionBlockedReport,
  buildCanonicalCompletionExhaustedReport,
} from "./canonical-runtime-result-report.js"
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js"
import type { CanonicalResultReportFacts } from "../contracts/canonical-result-report.js"

export type CanonicalCompletionOutcomeRecorder = (
  descriptor: CanonicalFinalizationTransitionDescriptor,
) => Promise<{ ok: true } | { ok: false; reasonCode: string }>

export type ReviewOutcomePassResult =
  | { kind: "break" }
  | {
      kind: "retry"
      nextMessage: string
      clearWorkerRuntime: boolean
      clearProvider?: boolean
      structuredFollowupKey?: string
      markTruncatedOutputRecoveryAttempted?: boolean
      requiredToolNames?: string[]
      nextAttemptToolPolicy?: NextAttemptToolPolicy
    }

interface ReviewOutcomePassDependencies {
  rememberRunApprovalScope: (runId: string, toolName: string) => void
  grantRunApprovalScope: (runId: string, toolName: string) => void
  grantRunSingleApproval: (runId: string, toolName: string) => void
  rememberRunFailure: (params: {
    runId: string
    sessionId: string
    source: FinalizationSource
    summary: string
    detail?: string
    title?: string
  }) => void
  incrementDelegationTurnCount: (runId: string, summary: string) => void
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
    status: "queued" | "running" | "awaiting_approval" | "awaiting_user" | "completed" | "failed" | "cancelled" | "interrupted",
    summary: string,
    active: boolean,
  ) => void
}

interface ReviewOutcomePassModuleDependencies {
  runSyntheticApprovalPass: typeof runSyntheticApprovalPass
  applySyntheticApprovalContinuation: typeof applySyntheticApprovalContinuation
  runCompletionPass: typeof runCompletionPass
  applyCompletionApplicationPass: typeof applyCompletionApplicationPass
}

const defaultModuleDependencies: ReviewOutcomePassModuleDependencies = {
  runSyntheticApprovalPass,
  applySyntheticApprovalContinuation,
  runCompletionPass,
  applyCompletionApplicationPass,
}

export async function runReviewOutcomePass(
  params: {
    runId: string
    sessionId: string
    source: FinalizationSource
    onChunk: RunChunkDeliveryHandler | undefined
    signal: AbortSignal
    preview: string
    previewSource?: UserFacingTextSource
    deferredPreviewDelivery?: boolean
    review: CompletionReviewResult | null
    reviewFailureReasonCode?:
      | "completion_review_provider_failed"
      | "completion_review_contract_invalid"
    syntheticApproval: SyntheticApprovalRequest | null
    executionSemantics: TaskExecutionSemantics
    deliveryOutcome: DeliveryOutcome
    successfulTools: SuccessfulToolEvidence[]
    completionConditions: string[]
    operationalEvidence?: CompletionReviewOperationalEvidence
    sawRealFilesystemMutation: boolean
    requiresFilesystemMutation: boolean
    truncatedOutputRecoveryAttempted: boolean
    originalRequest: string
    recoveryBudgetUsage: RecoveryBudgetUsage
    responseContext?: StandaloneAssistantMessageResponseContext | undefined
    delegationTurnCount?: number
    maxDelegationTurns?: number
    defaultMaxDelegationTurns: number
    followupPromptSeen: boolean
    syntheticApprovalAlreadyApproved: boolean
    syntheticApprovalSourceLabel: string
    syntheticApprovalRuntimeDependencies: SyntheticApprovalRuntimeDependencies
    finalizationDependencies: FinalizationDependencies
    recordCanonicalCompletionOutcome?: CanonicalCompletionOutcomeRecorder | undefined
    recordCanonicalDelivery?: CanonicalDeliveryRecorder | undefined
    stageCanonicalPendingResponse?: CanonicalPendingResponseStager | undefined
    consumeCanonicalPendingResponse?: CanonicalPendingResponseConsumer | undefined
  },
  dependencies: ReviewOutcomePassDependencies,
  moduleDependencies: ReviewOutcomePassModuleDependencies = defaultModuleDependencies,
): Promise<ReviewOutcomePassResult> {
  if (params.syntheticApproval) {
    const continuation = await moduleDependencies.runSyntheticApprovalPass({
      request: params.syntheticApproval,
      runId: params.runId,
      sessionId: params.sessionId,
      signal: params.signal,
      alreadyApproved: params.syntheticApprovalAlreadyApproved,
      sourceLabel: params.syntheticApprovalSourceLabel,
      originalRequest: params.originalRequest,
      latestAssistantMessage: params.preview,
      runtimeDependencies: params.syntheticApprovalRuntimeDependencies,
    })

    const approvalApplication = moduleDependencies.applySyntheticApprovalContinuation({
      runId: params.runId,
      continuation,
      aborted: params.signal.aborted,
    }, dependencies)

    if (approvalApplication.kind === "stop") {
      return { kind: "break" }
    }

    return {
      kind: "retry",
      nextMessage: approvalApplication.nextMessage,
      clearWorkerRuntime: approvalApplication.clearWorkerRuntime,
      ...(approvalApplication.clearProvider ? { clearProvider: approvalApplication.clearProvider } : {}),
    }
  }

  const structuredFollowupKey = params.review?.status === "followup" && params.review.followupPrompt?.trim()
    ? buildStructuredFollowupKey({
        kind: "followup",
        summary: params.review.summary || "Follow-up required.",
        reason: params.review.reason,
        remainingItems: params.review.remainingItems,
        followupPrompt: params.review.followupPrompt,
        followupEvidenceRefs: params.review.followupEvidenceRefs ?? [],
        evidenceRevisionRefs:
          params.review.contextReceipt?.evidenceRefs
          ?? params.review.followupEvidenceRefs
          ?? [],
        ...(params.review.followupExecutionMode
          ? { followupExecutionMode: params.review.followupExecutionMode }
          : {}),
        ...(params.review.followupRequiredToolNames?.length
          ? { followupRequiredToolNames: params.review.followupRequiredToolNames }
          : {}),
        ...(params.review.followupTargetRefs?.length
          ? { followupTargetRefs: params.review.followupTargetRefs }
          : {}),
      }, params.review.contextReceipt?.evidenceRefs)
    : undefined

  const completionPass = moduleDependencies.runCompletionPass({
    goalId: params.runId,
    review: params.review,
    ...(params.reviewFailureReasonCode
      ? { reviewFailureReasonCode: params.reviewFailureReasonCode }
      : {}),
    executionSemantics: params.executionSemantics,
    preview: params.preview,
    deliveryOutcome: params.deliveryOutcome,
    successfulTools: params.successfulTools,
    sawRealFilesystemMutation: params.sawRealFilesystemMutation,
    requiresFilesystemMutation: params.requiresFilesystemMutation,
    truncatedOutputRecoveryAttempted: params.truncatedOutputRecoveryAttempted,
    originalRequest: params.originalRequest,
    recoveryBudgetUsage: params.recoveryBudgetUsage,
    ...(typeof params.delegationTurnCount === "number"
      ? { delegationTurnCount: params.delegationTurnCount }
      : {}),
    ...(typeof params.maxDelegationTurns === "number"
      ? { maxDelegationTurns: params.maxDelegationTurns }
      : {}),
    defaultMaxDelegationTurns: params.defaultMaxDelegationTurns,
    followupAlreadySeen: params.followupPromptSeen,
  })

  let canonicalFinalOutcome: CanonicalFinalOutcome | undefined
  let terminalReport: CanonicalResultReportFacts | undefined
  if (params.recordCanonicalCompletionOutcome) {
    const expectedLlmDiagnosisContext = buildCompletionReviewContextReceipt({
      originalRequest: params.originalRequest,
      latestAssistantMessage: params.preview,
      successfulTools: params.successfulTools,
      ...(params.operationalEvidence
        ? { operationalEvidence: params.operationalEvidence }
        : {}),
      completionConditions: params.completionConditions,
    })
    const requiresLlmResultDiagnosis =
      params.review !== null && expectedLlmDiagnosisContext.evidenceRefs.length > 0
    const built = buildCanonicalCompletionOutcomeDescriptor({
      runId: params.runId,
      review: params.review,
      requiresLlmResultDiagnosis,
      ...(requiresLlmResultDiagnosis
        ? {
            expectedLlmDiagnosisContext,
            expectedLlmDiagnosisConditions: buildCompletionReviewExpectedConditions(
              params.completionConditions,
            ),
          }
        : {}),
      state: completionPass.state,
      application: completionPass.application,
      preview: params.preview,
    })
    if (!built.ok) {
      throw new CanonicalExecutionFailure({
        phase: "review",
        reasonCode: built.reasonCode,
        retryable: false,
      })
    }
    if (built.descriptor) {
      const recorded = await params.recordCanonicalCompletionOutcome(built.descriptor)
      if (!recorded.ok) {
        throw new CanonicalExecutionFailure({
          phase: "review",
          reasonCode: recorded.reasonCode,
          retryable: false,
        })
      }
      if (built.descriptor.event === "PATHS_EXHAUSTED") {
        canonicalFinalOutcome = "exhausted"
        terminalReport = buildCanonicalCompletionExhaustedReport({
          runId: params.runId,
          primaryLanguage:
            params.responseContext?.identityContext?.promptLocale === "ko" ? "ko" : "en",
          evidenceRefs: built.descriptor.receipt.evidenceRefs,
        })
      } else if (built.descriptor.event === "RESULT_BLOCKED") {
        canonicalFinalOutcome = "blocked"
        terminalReport = buildCanonicalCompletionBlockedReport({
          runId: params.runId,
          primaryLanguage:
            params.responseContext?.identityContext?.promptLocale === "ko" ? "ko" : "en",
          evidenceRefs: built.descriptor.receipt.evidenceRefs,
        })
      }
    }
  }

  const completionApplicationPass: CompletionApplicationPassResult = await moduleDependencies.applyCompletionApplicationPass({
    runId: params.runId,
    sessionId: params.sessionId,
    source: params.source,
    onChunk: params.onChunk,
    preview: params.preview,
    ...(params.previewSource ? { previewSource: params.previewSource } : {}),
    ...(params.deferredPreviewDelivery ? { deferredPreviewDelivery: true } : {}),
    state: completionPass.state,
    application: completionPass.application,
    maxTurns: completionPass.maxTurns,
    recoveryBudgetUsage: params.recoveryBudgetUsage,
    ...(params.responseContext ? { responseContext: params.responseContext } : {}),
    finalizationDependencies: params.finalizationDependencies,
    ...(params.recordCanonicalDelivery
      ? { recordCanonicalDelivery: params.recordCanonicalDelivery }
      : {}),
    ...(params.stageCanonicalPendingResponse
      ? { stageCanonicalPendingResponse: params.stageCanonicalPendingResponse }
      : {}),
    ...(params.consumeCanonicalPendingResponse
      ? { consumeCanonicalPendingResponse: params.consumeCanonicalPendingResponse }
      : {}),
    ...(canonicalFinalOutcome ? { canonicalFinalOutcome } : {}),
    ...(terminalReport ? { terminalReport } : {}),
  }, dependencies)

  if (completionApplicationPass.kind === "retry") {
    return {
      kind: "retry",
      nextMessage: completionApplicationPass.nextMessage,
      clearWorkerRuntime: completionApplicationPass.clearWorkerRuntime,
      ...(completionApplicationPass.structuredFollowupKey
        ? { structuredFollowupKey: completionApplicationPass.structuredFollowupKey }
        : structuredFollowupKey
          ? { structuredFollowupKey }
          : {}),
      ...(completionApplicationPass.markTruncatedOutputRecoveryAttempted
        ? { markTruncatedOutputRecoveryAttempted: completionApplicationPass.markTruncatedOutputRecoveryAttempted }
        : {}),
      ...(completionApplicationPass.requiredToolNames !== undefined
        ? { requiredToolNames: completionApplicationPass.requiredToolNames }
        : {}),
      ...(completionApplicationPass.nextAttemptToolPolicy
        ? { nextAttemptToolPolicy: completionApplicationPass.nextAttemptToolPolicy }
        : {}),
    }
  }

  return { kind: "break" }
}
