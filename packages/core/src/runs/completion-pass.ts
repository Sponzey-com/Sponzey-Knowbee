import type { CompletionReviewResult } from "../agent/completion-review.js"
import {
  evaluateStopReportDecision,
  type StopReportDecision,
} from "../contracts/stop-report-decision.js"
import {
  decideSubSessionCompletionIntegration,
  type SubAgentResultReview,
  type SubSessionCompletionIntegrationDecision,
} from "../agent/sub-agent-result-review.js"
import type { TaskExecutionSemantics } from "../agent/intake.js"
import type { DeliveryOutcome } from "./delivery.js"
import { deriveCompletionStageState, type CompletionStageState } from "./completion-state.js"
import {
  canConsumeRecoveryBudget,
  getRecoveryBudgetState,
  type RecoveryBudgetUsage,
} from "./recovery-budget.js"
import { type SuccessfulToolEvidence } from "./recovery.js"
import {
  decideCompletionApplication,
  type CompletionApplicationDecision,
} from "./completion-application.js"
import {
  decideCompletionFlow,
  type CompletionFlowDecision,
} from "./completion-flow.js"

export interface CompletionPassResult {
  state: CompletionStageState
  decision: CompletionFlowDecision
  application: CompletionApplicationDecision
  usedTurns: number
  maxTurns: number
  stopDecision: StopReportDecision
}

export function decideSubSessionCompletionPass(params: {
  subSessionReviews: Array<{ subSessionId: string; review: Pick<SubAgentResultReview, "accepted" | "normalizedFailureKey"> }>
}): SubSessionCompletionIntegrationDecision {
  return decideSubSessionCompletionIntegration(params.subSessionReviews)
}

export function runCompletionPass(params: {
  goalId: string
  review: CompletionReviewResult | null
  reviewFailureReasonCode?:
    | "completion_review_provider_failed"
    | "completion_review_contract_invalid"
  executionSemantics: TaskExecutionSemantics
  preview: string
  deliveryOutcome: DeliveryOutcome
  successfulTools: SuccessfulToolEvidence[]
  sawRealFilesystemMutation: boolean
  requiresFilesystemMutation: boolean
  truncatedOutputRecoveryAttempted: boolean
  originalRequest: string
  recoveryBudgetUsage: RecoveryBudgetUsage
  delegationTurnCount?: number
  maxDelegationTurns?: number
  defaultMaxDelegationTurns: number
  followupAlreadySeen: boolean
}): CompletionPassResult {
  const state = deriveCompletionStageState({
    review: params.review,
    executionSemantics: params.executionSemantics,
    preview: params.preview,
    deliverySatisfied: params.deliveryOutcome.deliverySatisfied,
    successfulTools: params.successfulTools,
    sawRealFilesystemMutation: params.sawRealFilesystemMutation,
    requiresFilesystemMutation: params.requiresFilesystemMutation,
    truncatedOutputRecoveryAttempted: params.truncatedOutputRecoveryAttempted,
  })

  const decision = decideCompletionFlow({
    review: params.review,
    ...(params.reviewFailureReasonCode
      ? { reviewFailureReasonCode: params.reviewFailureReasonCode }
      : {}),
    executionSemantics: params.executionSemantics,
    preview: params.preview,
    deliverySatisfied: params.deliveryOutcome.deliverySatisfied,
    successfulTools: params.successfulTools,
    sawRealFilesystemMutation: params.sawRealFilesystemMutation,
    requiresFilesystemMutation: params.requiresFilesystemMutation,
    truncatedOutputRecoveryAttempted: params.truncatedOutputRecoveryAttempted,
  })

  const usedTurns = params.delegationTurnCount ?? 0
  const maxTurns = params.maxDelegationTurns ?? params.defaultMaxDelegationTurns
  const interpretationBudget = getRecoveryBudgetState({
    usage: params.recoveryBudgetUsage,
    kind: "interpretation",
    maxDelegationTurns: maxTurns,
  })

  const application = decideCompletionApplication({
    decision,
    originalRequest: params.originalRequest,
    previousResult: params.preview,
    successfulTools: params.successfulTools,
    sawRealFilesystemMutation: params.sawRealFilesystemMutation,
    usedTurns,
    maxTurns,
    interpretationBudgetLimit: interpretationBudget.limit,
    executionBudgetLimit: getRecoveryBudgetState({
      usage: params.recoveryBudgetUsage,
      kind: "execution",
      maxDelegationTurns: maxTurns,
    }).limit,
    canRetryInterpretation: canConsumeRecoveryBudget({
      usage: params.recoveryBudgetUsage,
      kind: "interpretation",
      maxDelegationTurns: maxTurns,
    }),
    canRetryExecution: canConsumeRecoveryBudget({
      usage: params.recoveryBudgetUsage,
      kind: "execution",
      maxDelegationTurns: maxTurns,
    }),
    followupAlreadySeen: params.followupAlreadySeen,
  })

  const checklist = state.checklist?.items.filter((item) => item.status !== "not_required") ?? []
  const completionSatisfied = state.completionSatisfied
  const stopDecision = evaluateStopReportDecision({
    completion: {
      goalId: params.goalId,
      expectedCriterionIds: checklist.map((item) => item.key),
      satisfiedCriterionIds: completionSatisfied ? checklist.map((item) => item.key) : [],
      evidenceRefsByCriterion: completionSatisfied
        ? Object.fromEntries(checklist.map((item) => [item.key, [`completion-checklist:${item.key}`]]))
        : {},
      unresolvedItemIds: checklist.filter((item) => item.status === "pending").map((item) => item.key),
    },
    attempts: {
      currentTurn: usedTurns,
      currentRetry: params.recoveryBudgetUsage.interpretation + params.recoveryBudgetUsage.execution,
    },
    policy: interpretationBudget.policy,
  })

  const boundedApplication = application.kind === "retry" && stopDecision.status === "stop_and_report"
    ? {
        kind: "stop" as const,
        summary: "설정된 자동 진행 한도에 도달해 실행을 멈췄습니다.",
        reason: stopDecision.reasonCode,
        remainingItems: stopDecision.reportInput.unresolvedItemIds,
      }
    : application

  return {
    state,
    decision,
    application: boundedApplication,
    usedTurns,
    maxTurns,
    stopDecision,
  }
}
