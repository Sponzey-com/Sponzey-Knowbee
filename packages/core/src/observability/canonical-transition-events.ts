import type {
  CanonicalWorkAggregate,
  CanonicalWorkTransitionReceipt,
} from "../contracts/canonical-work-aggregate.js"
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js"
import {
  buildTypedObservabilityEvent,
  type TypedObservabilityEvent,
} from "./typed-event-contract.js"
import {
  recordTypedObservabilityEventSafely,
  type RecordTypedObservabilityEventReceipt,
  type TypedObservabilityEventRepository,
} from "./typed-event-repository.js"

export interface CanonicalTransitionObservabilityContext {
  requestId: string
  requestGroupId: string
  rootRunId: string
  runId: string
  parentRunId?: string | undefined
  at: number
}

export function recordCanonicalRequestReceivedObservability(input: {
  repository: TypedObservabilityEventRepository
  context: CanonicalTransitionObservabilityContext
  workId: string
  onDegraded?: ((error: unknown) => void) | undefined
}): RecordTypedObservabilityEventReceipt | { status: "rejected"; reasonCode: string } {
  const built = buildTypedObservabilityEvent({
    eventId: `typed-observability:${input.workId}:0`,
    kind: "request_received",
    purpose: "product",
    at: input.context.at,
    correlation: {
      requestId: input.context.requestId,
      requestGroupId: input.context.requestGroupId,
      rootRunId: input.context.rootRunId,
      runId: input.context.runId,
      ...(input.context.parentRunId ? { parentRunId: input.context.parentRunId } : {}),
      workId: input.workId,
    },
    reasonCode: "request_received",
    summary: "Request received",
  })
  if (built.status === "rejected") return built
  return recordTypedObservabilityEventSafely({
    repository: input.repository,
    event: built.event,
    ...(input.onDegraded ? { onDegraded: input.onDegraded } : {}),
  })
}

const REVIEW_EVENTS = new Set<CanonicalWorkEvent>([
  "ALL_CRITERIA_VERIFIED",
  "SOME_CRITERIA_VERIFIED",
  "POLICY_BLOCKED",
  "PATHS_EXHAUSTED",
  "USER_CANCELLED",
])

function latestTransition(
  aggregate: CanonicalWorkAggregate,
  predicate: (transition: CanonicalWorkTransitionReceipt) => boolean,
): CanonicalWorkTransitionReceipt | undefined {
  return [...aggregate.transitions].reverse().find(predicate)
}

function latestReceiptRef(
  aggregate: CanonicalWorkAggregate,
  events: ReadonlySet<CanonicalWorkEvent>,
): string | undefined {
  return latestTransition(aggregate, (transition) => events.has(transition.event))?.receiptRef
}

export function buildCanonicalTransitionObservabilityEvent(input: {
  aggregate: CanonicalWorkAggregate
  context: CanonicalTransitionObservabilityContext
}): { status: "ready"; event: TypedObservabilityEvent } | { status: "skipped" } | { status: "rejected"; reasonCode: string } {
  const transition = input.aggregate.transitions.at(-1)
  if (!transition) return { status: "skipped" }
  const base = {
    requestId: input.context.requestId,
    requestGroupId: input.context.requestGroupId,
    rootRunId: input.context.rootRunId,
    runId: input.context.runId,
    ...(input.context.parentRunId ? { parentRunId: input.context.parentRunId } : {}),
    workId: input.aggregate.workId,
  }
  const common = {
    eventId: `typed-observability:${input.aggregate.workId}:${transition.revision}`,
    at: input.context.at,
  }
  const executionReceipt = latestReceiptRef(input.aggregate, new Set<CanonicalWorkEvent>(["EXECUTION_STARTED"]))
  const evidenceReceipt = latestReceiptRef(input.aggregate, new Set<CanonicalWorkEvent>(["ATTEMPT_RECORDED"]))
  const reviewReceipt = latestReceiptRef(input.aggregate, REVIEW_EVENTS)

  const candidate = (() => {
    switch (transition.event) {
      case "DIAGNOSIS_ACCEPTED":
        return {
          ...common,
          kind: "analysis_completed" as const,
          purpose: "product" as const,
          correlation: base,
          reasonCode: "diagnosis_accepted",
          summary: "Solution analysis completed",
        }
      case "EXECUTION_STARTED":
        return {
          ...common,
          kind: "execution_started" as const,
          purpose: "field_debug" as const,
          correlation: { ...base, attemptId: transition.receiptRef },
          reasonCode: "execution_started",
          summary: "Execution attempt started",
        }
      case "ATTEMPT_RECORDED":
        if (!executionReceipt) return null
        return {
          ...common,
          kind: "evidence_recorded" as const,
          purpose: "field_debug" as const,
          correlation: { ...base, attemptId: executionReceipt, evidenceId: transition.receiptRef },
          reasonCode: "attempt_evidence_recorded",
          summary: "Execution evidence recorded",
        }
      case "ALL_CRITERIA_VERIFIED":
      case "SOME_CRITERIA_VERIFIED":
      case "POLICY_BLOCKED":
      case "PATHS_EXHAUSTED":
      case "USER_CANCELLED":
        return {
          ...common,
          kind: "review_completed" as const,
          purpose: "product" as const,
          correlation: {
            ...base,
            reviewId: transition.receiptRef,
            ...(evidenceReceipt ? { evidenceId: evidenceReceipt } : {}),
          },
          reasonCode: transition.event.toLowerCase(),
          summary: "Canonical result review completed",
        }
      case "RECOVERY_ACCEPTED":
        if (!executionReceipt) return null
        return {
          ...common,
          kind: "recovery_completed" as const,
          purpose: "field_debug" as const,
          correlation: {
            ...base,
            attemptId: executionReceipt,
            recoveryId: transition.receiptRef,
          },
          reasonCode: "recovery_accepted",
          summary: "Recovery decision accepted",
        }
      case "REPORT_DELIVERED":
        if (!reviewReceipt) return null
        return {
          ...common,
          kind: "finalization_completed" as const,
          purpose: "product" as const,
          correlation: { ...base, reviewId: reviewReceipt },
          reasonCode: "report_delivered",
          summary: "User report delivery completed",
        }
      default:
        return undefined
    }
  })()

  if (candidate === undefined) return { status: "skipped" }
  if (candidate === null) return { status: "rejected", reasonCode: "canonical_observability_reference_missing" }
  const built = buildTypedObservabilityEvent(candidate)
  return built.status === "ready"
    ? built
    : { status: "rejected", reasonCode: built.reasonCode }
}

export function recordCanonicalTransitionObservability(input: {
  repository: TypedObservabilityEventRepository
  aggregate: CanonicalWorkAggregate
  context: CanonicalTransitionObservabilityContext
  onDegraded?: ((error: unknown) => void) | undefined
}): RecordTypedObservabilityEventReceipt | { status: "skipped" } | { status: "rejected"; reasonCode: string } {
  const built = buildCanonicalTransitionObservabilityEvent(input)
  if (built.status !== "ready") return built
  return recordTypedObservabilityEventSafely({
    repository: input.repository,
    event: built.event,
    ...(input.onDegraded ? { onDegraded: input.onDegraded } : {}),
  })
}
