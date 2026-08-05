import {
  buildTypedObservabilityEvent,
  type TypedObservabilityEvent,
  type TypedObservabilityEventRejectionReason,
} from "./typed-event-contract.js"

export interface TypedObservabilityRepositoryQuery {
  requestId?: string | undefined
  requestGroupId?: string | undefined
  rootRunId?: string | undefined
  runId?: string | undefined
  workId?: string | undefined
  limit?: number | undefined
}

export type TypedObservabilityStoredIssueCode =
  | "schema_version_unsupported"
  | "stored_payload_invalid"
  | "stored_event_invalid"

export interface TypedObservabilityStoredIssue {
  code: TypedObservabilityStoredIssueCode
  eventId: string
}

export interface TypedObservabilityRepositorySnapshot {
  events: readonly TypedObservabilityEvent[]
  issues: readonly TypedObservabilityStoredIssue[]
}

export type TypedObservabilityAppendResult =
  | { status: "stored"; inserted: boolean; eventId: string }
  | { status: "rejected"; reasonCode: TypedObservabilityEventRejectionReason | "event_id_conflict" }

export interface TypedObservabilityEventRepository {
  append(event: TypedObservabilityEvent): TypedObservabilityAppendResult
  list(query: TypedObservabilityRepositoryQuery): TypedObservabilityRepositorySnapshot
}

export type RecordTypedObservabilityEventReceipt =
  | TypedObservabilityAppendResult
  | { status: "degraded"; reasonCode: "repository_write_failed" }

export function recordTypedObservabilityEventSafely(input: {
  repository: TypedObservabilityEventRepository
  event: TypedObservabilityEvent
  onDegraded?: ((error: unknown) => void) | undefined
}): RecordTypedObservabilityEventReceipt {
  const validation = buildTypedObservabilityEvent(input.event)
  if (validation.status === "rejected") return validation
  try {
    return input.repository.append(validation.event)
  } catch (error) {
    input.onDegraded?.(error)
    return { status: "degraded", reasonCode: "repository_write_failed" }
  }
}
