import {
  applyCanonicalWorkEvent,
  type CanonicalWorkAggregate,
} from "../contracts/canonical-work-aggregate.js"
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js"
import {
  projectCanonicalWorkStateToRunStatus,
  type CanonicalFinalOutcome,
  type CanonicalRunStatusProjection,
  type CanonicalWaitingKind,
} from "./canonical-work-run-projection.js"

export interface CanonicalWorkRepository {
  load(workId: string): CanonicalWorkAggregate | undefined
  save(input: {
    aggregate: CanonicalWorkAggregate
    expectedRevision: number
  }): { saved: true } | { saved: false; reasonCode: "revision_conflict"; currentRevision: number }
}

export interface CanonicalWorkTransitionUseCaseInput {
  workId: string
  expectedRevision: number
  event: CanonicalWorkEvent
  receiptRef: string
  waitingKind?: CanonicalWaitingKind
  finalOutcome?: CanonicalFinalOutcome
}

export type CanonicalWorkTransitionUseCaseResult =
  | {
      status: "applied"
      aggregate: CanonicalWorkAggregate
      runProjection: CanonicalRunStatusProjection
    }
  | {
      status: "rejected"
      reasonCode:
        | "aggregate_not_found"
        | "aggregate_identity_mismatch"
        | "stale_revision"
        | "receipt_required"
        | "transition_not_allowed"
        | "terminal_state_locked"
        | "waiting_kind_required"
        | "final_report_outcome_required"
      currentRevision?: number
    }
  | { status: "conflict"; reasonCode: "revision_conflict"; currentRevision: number }

export function executeCanonicalWorkTransition(input: {
  repository: CanonicalWorkRepository
  input: CanonicalWorkTransitionUseCaseInput
}): CanonicalWorkTransitionUseCaseResult {
  const current = input.repository.load(input.input.workId)
  if (!current) return { status: "rejected", reasonCode: "aggregate_not_found" }
  if (current.workId !== input.input.workId) {
    return { status: "rejected", reasonCode: "aggregate_identity_mismatch" }
  }

  const transition = applyCanonicalWorkEvent({
    aggregate: current,
    expectedRevision: input.input.expectedRevision,
    event: input.input.event,
    receiptRef: input.input.receiptRef,
  })
  if (!transition.applied) {
    return {
      status: "rejected",
      reasonCode: transition.reasonCode,
      ...(transition.reasonCode === "stale_revision"
        ? { currentRevision: transition.currentRevision }
        : {}),
    }
  }

  const projection = projectCanonicalWorkStateToRunStatus({
    state: transition.aggregate.state,
    ...(input.input.waitingKind ? { waitingKind: input.input.waitingKind } : {}),
    ...(input.input.finalOutcome ? { finalOutcome: input.input.finalOutcome } : {}),
  })
  if (!projection.ok) return { status: "rejected", reasonCode: projection.reasonCode }

  const saved = input.repository.save({
    aggregate: transition.aggregate,
    expectedRevision: input.input.expectedRevision,
  })
  if (!saved.saved) {
    return { status: "conflict", reasonCode: saved.reasonCode, currentRevision: saved.currentRevision }
  }
  return {
    status: "applied",
    aggregate: transition.aggregate,
    runProjection: projection.projection,
  }
}
