import {
  transitionCanonicalWorkState,
  type CanonicalWorkEvent,
  type CanonicalWorkState,
  type CanonicalWorkTransitionDecision,
} from "./canonical-work-state.js"

export interface CanonicalWorkTransitionReceipt {
  revision: number
  event: CanonicalWorkEvent
  previousState: CanonicalWorkState
  nextState: CanonicalWorkState
  receiptRef: string
}

export interface CanonicalWorkAggregate {
  workId: string
  rootRunId: string
  state: CanonicalWorkState
  revision: number
  transitions: CanonicalWorkTransitionReceipt[]
}

export type CanonicalWorkAggregateTransitionResult =
  | { applied: true; aggregate: CanonicalWorkAggregate; receipt: CanonicalWorkTransitionReceipt }
  | {
      applied: false
      reasonCode: "stale_revision"
      currentRevision: number
    }
  | {
      applied: false
      reasonCode: Extract<CanonicalWorkTransitionDecision, { accepted: false }>["reasonCode"]
    }

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function revision(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`)
  return value
}

export function canonicalWorkIdForRootRun(rootRunId: string): string {
  return `work:root:${required(rootRunId, "Root run ID")}`
}

export function createCanonicalWorkAggregate(input: {
  workId: string
  rootRunId: string
}): CanonicalWorkAggregate {
  return {
    workId: required(input.workId, "Work ID"),
    rootRunId: required(input.rootRunId, "Root run ID"),
    state: "REQUEST_RECEIVED",
    revision: 0,
    transitions: [],
  }
}

export function applyCanonicalWorkEvent(input: {
  aggregate: CanonicalWorkAggregate
  expectedRevision: number
  event: CanonicalWorkEvent
  receiptRef: string
}): CanonicalWorkAggregateTransitionResult {
  const expectedRevision = revision(input.expectedRevision, "Expected revision")
  if (expectedRevision !== input.aggregate.revision) {
    return { applied: false, reasonCode: "stale_revision", currentRevision: input.aggregate.revision }
  }

  const transition = transitionCanonicalWorkState({
    currentState: input.aggregate.state,
    event: input.event,
    receiptRef: input.receiptRef,
  })
  if (!transition.accepted) return { applied: false, reasonCode: transition.reasonCode }

  const receipt: CanonicalWorkTransitionReceipt = {
    revision: input.aggregate.revision + 1,
    event: transition.event,
    previousState: transition.previousState,
    nextState: transition.nextState,
    receiptRef: transition.receiptRef,
  }
  return {
    applied: true,
    receipt,
    aggregate: {
      ...input.aggregate,
      state: transition.nextState,
      revision: receipt.revision,
      transitions: [...input.aggregate.transitions, receipt],
    },
  }
}
