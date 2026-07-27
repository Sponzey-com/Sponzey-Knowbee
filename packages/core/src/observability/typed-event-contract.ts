export type ObservabilityLogPurpose = "product" | "field_debug" | "development"

export type TypedObservabilityEventKind =
  | "request_received"
  | "analysis_started"
  | "analysis_completed"
  | "execution_started"
  | "execution_completed"
  | "evidence_recorded"
  | "review_completed"
  | "recovery_started"
  | "recovery_completed"
  | "finalization_completed"

export interface ObservabilityCorrelationContext {
  requestId: string
  requestGroupId: string
  rootRunId: string
  runId: string
  parentRunId?: string | undefined
  workId?: string | undefined
  attemptId?: string | undefined
  evidenceId?: string | undefined
  reviewId?: string | undefined
  recoveryId?: string | undefined
}

export type ObservabilityAttributeValue = string | number | boolean | null

export interface TypedObservabilityEvent {
  eventId: string
  kind: TypedObservabilityEventKind
  purpose: ObservabilityLogPurpose
  at: number
  correlation: Readonly<ObservabilityCorrelationContext>
  reasonCode: string
  summary: string
  attributes?: Readonly<Record<string, ObservabilityAttributeValue>> | undefined
}

export type TypedObservabilityEventRejectionReason =
  | "event_id_required"
  | "invalid_timestamp"
  | "correlation_id_required"
  | "work_id_required"
  | "attempt_id_required"
  | "evidence_id_required"
  | "review_id_required"
  | "recovery_id_required"
  | "reason_code_invalid"
  | "summary_invalid"
  | "unsafe_summary"
  | "unsafe_attribute_key"
  | "unsafe_attribute_value"

export type BuildTypedObservabilityEventResult =
  | { status: "ready"; event: TypedObservabilityEvent }
  | { status: "rejected"; reasonCode: TypedObservabilityEventRejectionReason }

export interface TypedObservabilityTraceIssue {
  code:
    | "cross_request_link"
    | "stage_regression"
    | "duplicate_finalization"
    | "correlation_mismatch"
    | "missing_parent_run"
    | "evidence_review_mismatch"
    | "unknown_review"
  eventId: string
}

export interface TypedObservabilityTraceProjection {
  requestId: string | null
  events: readonly TypedObservabilityEvent[]
  issues: readonly TypedObservabilityTraceIssue[]
  terminal: boolean
}

const IDENTIFIER_KEYS: ReadonlyArray<keyof ObservabilityCorrelationContext> = [
  "requestId",
  "requestGroupId",
  "rootRunId",
  "runId",
]
const WORK_KINDS = new Set<TypedObservabilityEventKind>([
  "analysis_started",
  "analysis_completed",
  "execution_started",
  "execution_completed",
  "evidence_recorded",
  "review_completed",
  "recovery_started",
  "recovery_completed",
  "finalization_completed",
])
const ATTEMPT_KINDS = new Set<TypedObservabilityEventKind>([
  "execution_started",
  "execution_completed",
  "evidence_recorded",
  "recovery_started",
  "recovery_completed",
])
const REVIEW_KINDS = new Set<TypedObservabilityEventKind>(["review_completed", "finalization_completed"])
const RECOVERY_KINDS = new Set<TypedObservabilityEventKind>(["recovery_started", "recovery_completed"])
const UNSAFE_ATTRIBUTE_KEY = /(?:raw|prompt|memory|secret|token|password|credential|authorization|cookie|stack|path|body|response)/iu
const INTERNAL_ID_ATTRIBUTE_KEY = /(?:request|group|rootRun|run|work|attempt|evidence|review|recovery|agent|session)(?:_?id|Id)$/u
const UNSAFE_TEXT = /(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\|Bearer\s+|\bsk-[A-Za-z0-9_-]{8,}|\bxox[baprs]-)/u
const REASON_CODE = /^[a-z][a-z0-9_]{1,79}$/u

const STAGE_RANK: Record<TypedObservabilityEventKind, number> = {
  request_received: 0,
  analysis_started: 1,
  analysis_completed: 1,
  execution_started: 2,
  execution_completed: 2,
  evidence_recorded: 3,
  review_completed: 4,
  recovery_started: 2,
  recovery_completed: 2,
  finalization_completed: 5,
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function requiredCorrelationReason(
  kind: TypedObservabilityEventKind,
  correlation: ObservabilityCorrelationContext,
): TypedObservabilityEventRejectionReason | null {
  if (IDENTIFIER_KEYS.some((key) => !nonEmpty(correlation[key]))) return "correlation_id_required"
  if (WORK_KINDS.has(kind) && !nonEmpty(correlation.workId)) return "work_id_required"
  if (ATTEMPT_KINDS.has(kind) && !nonEmpty(correlation.attemptId)) return "attempt_id_required"
  if (kind === "evidence_recorded" && !nonEmpty(correlation.evidenceId)) return "evidence_id_required"
  if (REVIEW_KINDS.has(kind) && !nonEmpty(correlation.reviewId)) return "review_id_required"
  if (RECOVERY_KINDS.has(kind) && !nonEmpty(correlation.recoveryId)) return "recovery_id_required"
  return null
}

export function buildTypedObservabilityEvent(
  input: TypedObservabilityEvent,
): BuildTypedObservabilityEventResult {
  if (!nonEmpty(input.eventId)) return { status: "rejected", reasonCode: "event_id_required" }
  if (!Number.isFinite(input.at) || input.at < 0) return { status: "rejected", reasonCode: "invalid_timestamp" }
  const correlationReason = requiredCorrelationReason(input.kind, input.correlation)
  if (correlationReason) return { status: "rejected", reasonCode: correlationReason }
  if (!REASON_CODE.test(input.reasonCode)) return { status: "rejected", reasonCode: "reason_code_invalid" }
  const summary = input.summary.trim()
  if (!summary || summary.length > 240 || /[\r\n]/u.test(summary)) {
    return { status: "rejected", reasonCode: "summary_invalid" }
  }
  if (UNSAFE_TEXT.test(summary)) return { status: "rejected", reasonCode: "unsafe_summary" }

  for (const [key, value] of Object.entries(input.attributes ?? {})) {
    if (UNSAFE_ATTRIBUTE_KEY.test(key) || (input.purpose === "product" && INTERNAL_ID_ATTRIBUTE_KEY.test(key))) {
      return { status: "rejected", reasonCode: "unsafe_attribute_key" }
    }
    if (typeof value === "string" && (value.length > 240 || UNSAFE_TEXT.test(value) || /[\r\n]/u.test(value))) {
      return { status: "rejected", reasonCode: "unsafe_attribute_value" }
    }
  }

  return {
    status: "ready",
    event: Object.freeze({
      ...input,
      eventId: input.eventId.trim(),
      reasonCode: input.reasonCode.trim(),
      summary,
      correlation: Object.freeze({ ...input.correlation }),
      ...(input.attributes ? { attributes: Object.freeze({ ...input.attributes }) } : {}),
    }),
  }
}

function sameCorrelationRoot(
  left: ObservabilityCorrelationContext,
  right: ObservabilityCorrelationContext,
): boolean {
  return left.requestGroupId === right.requestGroupId
    && left.rootRunId === right.rootRunId
}

export function projectTypedObservabilityTrace(
  input: readonly TypedObservabilityEvent[],
): TypedObservabilityTraceProjection {
  const events = [...input].sort((left, right) => (left.at - right.at) || left.eventId.localeCompare(right.eventId))
  const issues: TypedObservabilityTraceIssue[] = []
  const first = events[0]
  const runIds = new Set(events.map((event) => event.correlation.runId))
  const highestStageByScope = new Map<string, number>()
  const finalizationCountByScope = new Map<string, number>()
  const evidenceById = new Map<string, TypedObservabilityEvent>()
  const reviewById = new Map<string, TypedObservabilityEvent>()

  for (const event of events) {
    if (first && event.correlation.requestId !== first.correlation.requestId) {
      issues.push({ code: "cross_request_link", eventId: event.eventId })
    }
    if (first && !sameCorrelationRoot(event.correlation, first.correlation)) {
      issues.push({ code: "correlation_mismatch", eventId: event.eventId })
    }
    if (event.correlation.parentRunId && !runIds.has(event.correlation.parentRunId)) {
      issues.push({ code: "missing_parent_run", eventId: event.eventId })
    }
    const scopeKey = `${event.correlation.runId}:${event.correlation.workId ?? "request"}`
    const stage = STAGE_RANK[event.kind]
    const highestStage = highestStageByScope.get(scopeKey) ?? -1
    if (stage < highestStage && !event.kind.startsWith("recovery_")) {
      issues.push({ code: "stage_regression", eventId: event.eventId })
    }
    highestStageByScope.set(
      scopeKey,
      event.kind === "recovery_completed" ? stage : Math.max(highestStage, stage),
    )
    if (event.kind === "evidence_recorded" && event.correlation.evidenceId) {
      evidenceById.set(event.correlation.evidenceId, event)
    }
    if (event.kind === "review_completed" && event.correlation.reviewId) {
      const evidence = event.correlation.evidenceId
        ? evidenceById.get(event.correlation.evidenceId)
        : undefined
      if (event.correlation.evidenceId && (
        !evidence
        || evidence.correlation.workId !== event.correlation.workId
        || evidence.correlation.runId !== event.correlation.runId
      )) {
        issues.push({ code: "evidence_review_mismatch", eventId: event.eventId })
      }
      reviewById.set(event.correlation.reviewId, event)
    }
    if (event.kind === "finalization_completed") {
      const finalizationCount = (finalizationCountByScope.get(scopeKey) ?? 0) + 1
      finalizationCountByScope.set(scopeKey, finalizationCount)
      if (finalizationCount > 1) {
        issues.push({ code: "duplicate_finalization", eventId: event.eventId })
      }
      const review = event.correlation.reviewId
        ? reviewById.get(event.correlation.reviewId)
        : undefined
      if (!review
        || review.correlation.workId !== event.correlation.workId
        || review.correlation.runId !== event.correlation.runId) {
        issues.push({ code: "unknown_review", eventId: event.eventId })
      }
    }
  }

  const finalizationCount = [...finalizationCountByScope.values()].reduce((sum, count) => sum + count, 0)

  return {
    requestId: first?.correlation.requestId ?? null,
    events,
    issues,
    terminal: finalizationCount > 0 && issues.every((issue) => ![
      "duplicate_finalization",
      "unknown_review",
      "cross_request_link",
      "correlation_mismatch",
    ].includes(issue.code)),
  }
}
