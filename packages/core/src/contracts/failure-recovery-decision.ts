import {
  authorizeDiagnosisActionRoute,
  type LlmDiagnosisReceipt,
} from "./diagnosis-action-routing.js"
import {
  validateRecoveryCandidateAgainstFailure,
  type FailureDiagnosis,
  type LlmResultDiagnosisRecord,
  type RecoveryCandidate,
  type RecoveryChangedDimension,
} from "./work-record.js"

export type FailureRecoveryState =
  | "diagnosing"
  | "generating_candidates"
  | "reviewing_constraints"
  | "selecting_action"
  | "retry_ready"
  | "report_ready"
  | "stopped"

export type FailureRecoveryEvent =
  | "diagnosis_recorded"
  | "candidates_generated"
  | "constraints_reviewed"
  | "retry_selected"
  | "partial_report_selected"
  | "stop_selected"

export type RecoveryStopCondition =
  | "goal_achieved"
  | "permission_denied"
  | "safety_risk"
  | "required_resource_unavailable"
  | "alternatives_exhausted"

export interface RecoveryCandidateConstraintReview {
  candidateIndex: number
  safety: "allowed" | "denied"
  permission: "allowed" | "denied"
  resource: "available" | "unavailable"
  evidenceRefs: string[]
}

export interface RecoveryStopRecord {
  condition: RecoveryStopCondition
  reason: string
  evidenceRefs: string[]
  partialResultRefs?: string[]
  unresolvedScope: string[]
  userActions: string[]
}

export interface RecoveryPartialReport {
  partialResultRefs: string[]
  unresolvedScope: string[]
  nextActions: string[]
  evidenceRefs: string[]
}

export interface StructuredFailureRecoveryInput {
  subjectPayload: unknown
  diagnosis: LlmResultDiagnosisRecord
  receipt: LlmDiagnosisReceipt | undefined
  failureDiagnosis: FailureDiagnosis
  recoveryCandidates: RecoveryCandidate[]
  selectedCandidateIndex?: number
  constraintReviews: RecoveryCandidateConstraintReview[]
  retryCount: number
  retryLimit: number
  currentAttemptSignature: string
  priorAttemptSignatures: string[]
  nextAttemptSignature?: string
  stop?: RecoveryStopRecord
  partialReport?: RecoveryPartialReport
}

export interface StructuredFailureRecoveryDecision {
  state: "retry_ready" | "report_ready" | "stopped"
  outcome: "retry" | "redelegate" | "partial" | "completed" | "blocked"
  receiptId: string
  selectedCandidate?: RecoveryCandidate
  changedDimensions?: RecoveryChangedDimension[]
  nextAttemptSignature?: string
  stopCondition?: RecoveryStopCondition
  reason?: string
  evidenceRefs: string[]
  partialResultRefs: string[]
  unresolvedScope: string[]
  userActions: string[]
  stateTrace: FailureRecoveryState[]
}

type CoreRecoveryDecision = Omit<StructuredFailureRecoveryDecision, "stateTrace">

const TRANSITIONS: Readonly<Partial<Record<FailureRecoveryState, Partial<Record<FailureRecoveryEvent, FailureRecoveryState>>>>> = {
  diagnosing: { diagnosis_recorded: "generating_candidates" },
  generating_candidates: { candidates_generated: "reviewing_constraints" },
  reviewing_constraints: { constraints_reviewed: "selecting_action" },
  selecting_action: {
    retry_selected: "retry_ready",
    partial_report_selected: "report_ready",
    stop_selected: "stopped",
  },
}

function requireText(value: string | undefined, field: string): string {
  const normalized = value?.trim() ?? ""
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function requireTextList(values: string[] | undefined, field: string): string[] {
  if (!values?.length) throw new Error(`${field} requires at least one evidence value.`)
  const normalized = values.map((value) => requireText(value, field))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${field} values must be unique.`)
  return normalized
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`)
}

function validateFailure(failure: FailureDiagnosis): void {
  requireText(failure.failed_step_id, "Failure step ID")
  requireText(failure.failure_reason, "Failure reason")
  requireTextList(failure.failed_input_refs, "Failed input references")
  requireText(failure.failed_strategy, "Failed strategy")
  if (!failure.recoverable) throw new Error("Failure diagnosis must be recoverable before a recovery action is selected.")
}

function validateStop(input: StructuredFailureRecoveryInput, receiptId: string): CoreRecoveryDecision {
  const stop = input.stop
  if (!stop) throw new Error("A structured stop condition is required before recovery can stop.")
  const reason = requireText(stop.reason, "Recovery stop reason")
  const evidenceRefs = requireTextList(stop.evidenceRefs, "Recovery stop evidence")
  const partialResultRefs = stop.partialResultRefs?.map((value) => requireText(value, "Partial result reference")) ?? []

  if (stop.condition === "goal_achieved") {
    if (input.diagnosis.recommended_action !== "final_report") {
      throw new Error("Goal-achieved recovery requires an LLM final_report diagnosis.")
    }
    if (stop.unresolvedScope.length > 0) throw new Error("Goal-achieved recovery cannot retain unresolved scope.")
    return {
      state: "stopped",
      outcome: "completed",
      receiptId,
      stopCondition: stop.condition,
      reason,
      evidenceRefs,
      partialResultRefs,
      unresolvedScope: [],
      userActions: [],
    }
  }

  if (stop.condition === "alternatives_exhausted" && input.recoveryCandidates.length > 0) {
    for (let index = 0; index < input.recoveryCandidates.length; index += 1) {
      const review = input.constraintReviews.find((candidate) => candidate.candidateIndex === index)
      if (!review) throw new Error("alternatives_exhausted requires a constraint review for every recovery candidate.")
      requireTextList(review.evidenceRefs, "Recovery constraint review evidence")
      if (review.safety === "allowed" && review.permission === "allowed" && review.resource === "available") {
        throw new Error("alternatives_exhausted cannot be selected while an allowed recovery candidate remains.")
      }
    }
  }
  if (input.diagnosis.recommended_action !== "stop_blocked") {
    throw new Error(`${stop.condition} requires an LLM stop_blocked diagnosis.`)
  }
  const unresolvedScope = requireTextList(stop.unresolvedScope, "Unresolved scope")
  const userActions = requireTextList(stop.userActions, "Recovery user actions")
  return {
    state: "stopped",
    outcome: "blocked",
    receiptId,
    stopCondition: stop.condition,
    reason,
    evidenceRefs,
    partialResultRefs,
    unresolvedScope,
    userActions,
  }
}

function validatePartialReport(input: StructuredFailureRecoveryInput, receiptId: string): CoreRecoveryDecision {
  const report = input.partialReport
  if (!report) throw new Error("A structured partial report is required for partial_report.")
  return {
    state: "report_ready",
    outcome: "partial",
    receiptId,
    evidenceRefs: requireTextList(report.evidenceRefs, "Partial report evidence"),
    partialResultRefs: requireTextList(report.partialResultRefs, "Partial result references"),
    unresolvedScope: requireTextList(report.unresolvedScope, "Partial unresolved scope"),
    userActions: requireTextList(report.nextActions, "Partial report next actions"),
  }
}

function validateRetry(input: StructuredFailureRecoveryInput, receiptId: string): CoreRecoveryDecision {
  const selectedIndex = input.selectedCandidateIndex
  if (!Number.isInteger(selectedIndex) || selectedIndex === undefined || selectedIndex < 0) {
    throw new Error("A selected recovery candidate index is required.")
  }
  const selected = input.recoveryCandidates[selectedIndex]
  if (!selected) throw new Error("Selected recovery candidate is not in recovery_candidates.")
  if (selected.action_type !== input.diagnosis.recommended_action) {
    throw new Error("Selected recovery candidate action does not match the LLM diagnosis action.")
  }
  const validation = validateRecoveryCandidateAgainstFailure(input.failureDiagnosis, selected)
  if (!validation.ok) throw new Error(`Recovery candidate must have a valid changed dimension: ${validation.issues[0]?.message ?? "invalid candidate"}`)

  const review = input.constraintReviews.find((candidate) => candidate.candidateIndex === selectedIndex)
  if (!review) throw new Error("Selected recovery candidate requires a constraint review.")
  const evidenceRefs = requireTextList(review.evidenceRefs, "Recovery constraint review evidence")
  if (review.safety !== "allowed" || review.permission !== "allowed" || review.resource !== "available") {
    throw new Error("Selected recovery candidate is not allowed by safety, permission, and resource constraints.")
  }

  const currentSignature = requireText(input.currentAttemptSignature, "Current attempt signature")
  const nextSignature = requireText(input.nextAttemptSignature, "Next attempt signature")
  const priorSignatures = input.priorAttemptSignatures.map((value) => requireText(value, "Prior attempt signature"))
  if (nextSignature === currentSignature || priorSignatures.includes(nextSignature)) {
    throw new Error("Recovery candidate would repeat a duplicate attempt signature.")
  }
  return {
    state: "retry_ready",
    outcome: selected.action_type === "redelegate" ? "redelegate" : "retry",
    receiptId,
    selectedCandidate: selected,
    changedDimensions: [...selected.changed_dimensions],
    nextAttemptSignature: nextSignature,
    evidenceRefs,
    partialResultRefs: [],
    unresolvedScope: [input.failureDiagnosis.failed_step_id],
    userActions: [],
  }
}

export function decideStructuredFailureRecovery(input: StructuredFailureRecoveryInput): StructuredFailureRecoveryDecision {
  validateFailure(input.failureDiagnosis)
  assertNonNegativeInteger(input.retryCount, "retry_count")
  assertNonNegativeInteger(input.retryLimit, "retry_limit")
  const route = authorizeDiagnosisActionRoute({
    receipt: input.receipt,
    subjectPayload: input.subjectPayload,
    diagnosis: input.diagnosis,
  })

  let decision: CoreRecoveryDecision
  switch (input.diagnosis.recommended_action) {
    case "retry":
    case "redelegate":
      decision = validateRetry(input, route.receiptId)
      break
    case "partial_report":
      decision = validatePartialReport(input, route.receiptId)
      break
    case "final_report":
    case "stop_blocked":
      decision = validateStop(input, route.receiptId)
      break
    default:
      throw new Error(`LLM diagnosis action ${input.diagnosis.recommended_action} is not a failure recovery outcome.`)
  }
  const terminalEvent: FailureRecoveryEvent = decision.state === "retry_ready"
    ? "retry_selected"
    : decision.state === "report_ready"
      ? "partial_report_selected"
      : "stop_selected"
  const stateTrace: FailureRecoveryState[] = ["diagnosing"]
  stateTrace.push(transitionFailureRecovery(stateTrace.at(-1) as FailureRecoveryState, "diagnosis_recorded"))
  stateTrace.push(transitionFailureRecovery(stateTrace.at(-1) as FailureRecoveryState, "candidates_generated"))
  stateTrace.push(transitionFailureRecovery(stateTrace.at(-1) as FailureRecoveryState, "constraints_reviewed"))
  stateTrace.push(transitionFailureRecovery(stateTrace.at(-1) as FailureRecoveryState, terminalEvent))
  return { ...decision, stateTrace }
}

export function transitionFailureRecovery(
  state: FailureRecoveryState,
  event: FailureRecoveryEvent,
): FailureRecoveryState {
  if (state === "retry_ready" || state === "report_ready" || state === "stopped") {
    throw new Error(`Failure recovery state ${state} is terminal.`)
  }
  const next = TRANSITIONS[state]?.[event]
  if (!next) throw new Error(`Invalid failure recovery transition: ${state} + ${event}.`)
  return next
}
