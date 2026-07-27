import type { WebRetrievalMethod } from "./web-retrieval.js"

export type WebResearchExecutionState = "started" | "succeeded" | "failed" | "cancelled"

export interface WebResearchExecutionEvent {
  readonly sequence: number
  readonly eventId: string
  readonly runId: string
  readonly actionReceiptId: string
  readonly method: WebRetrievalMethod
  readonly strategyFingerprint: `sha256:${string}`
  readonly state: WebResearchExecutionState
  readonly evidenceRefs: readonly string[]
  readonly recordedAt: number
}

export type WebResearchExecutionEventInput = Omit<WebResearchExecutionEvent, "sequence">

export interface WebResearchExecutionLedger {
  readonly schemaVersion: 1
  readonly runId: string
  readonly events: readonly WebResearchExecutionEvent[]
}

export type WebResearchExecutionAppendReason =
  | "web_execution_event_invalid"
  | "web_execution_run_mismatch"
  | "web_execution_event_duplicate"
  | "web_execution_action_duplicate"
  | "web_execution_transition_invalid"
  | "web_execution_scope_mismatch"

export type WebResearchExecutionAppendResult =
  | Readonly<{ ok: true; ledger: WebResearchExecutionLedger }>
  | Readonly<{ ok: false; reasonCode: WebResearchExecutionAppendReason }>

export type WebResearchEvidenceKind = "search_result" | "document"

export interface WebResearchEvidenceEntry {
  readonly sequence: number
  readonly entryId: string
  readonly runId: string
  readonly evidenceRef: string
  readonly kind: WebResearchEvidenceKind
  readonly method: WebRetrievalMethod
  readonly parentActionReceiptId: string
  readonly provenanceRef: string
  readonly parentEvidenceRefs: readonly string[]
}

export type WebResearchEvidenceEntryInput = Omit<WebResearchEvidenceEntry, "sequence">

export interface WebResearchEvidenceLedger {
  readonly schemaVersion: 1
  readonly runId: string
  readonly entries: readonly WebResearchEvidenceEntry[]
}

export type WebResearchEvidenceAppendReason =
  | "web_evidence_entry_invalid"
  | "web_evidence_run_mismatch"
  | "web_evidence_entry_duplicate"
  | "web_evidence_ref_duplicate"
  | "web_evidence_action_not_succeeded"
  | "web_evidence_parent_missing"

export type WebResearchEvidenceAppendResult =
  | Readonly<{ ok: true; ledger: WebResearchEvidenceLedger }>
  | Readonly<{ ok: false; reasonCode: WebResearchEvidenceAppendReason }>

const SHA256 = /^sha256:[a-f0-9]{64}$/u
const METHODS = new Set<WebRetrievalMethod>([
  "official_api",
  "direct_fetch",
  "fast_text_search",
  "browser_search",
])

function text(value: unknown, maxLength = 256): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null
}

function uniqueTextList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value.map((item) => text(item))
  if (normalized.some((item) => item === null) || new Set(normalized).size !== normalized.length) {
    return null
  }
  return Object.freeze(normalized as string[])
}

function executionRejected(
  reasonCode: WebResearchExecutionAppendReason,
): WebResearchExecutionAppendResult {
  return Object.freeze({ ok: false, reasonCode })
}

function evidenceRejected(
  reasonCode: WebResearchEvidenceAppendReason,
): WebResearchEvidenceAppendResult {
  return Object.freeze({ ok: false, reasonCode })
}

export function createWebResearchExecutionLedger(runId: string): WebResearchExecutionLedger {
  const normalizedRunId = text(runId)
  if (!normalizedRunId) throw new Error("Web research execution ledger run ID is invalid.")
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: normalizedRunId,
    events: Object.freeze([]),
  })
}

export function appendWebResearchExecutionEvent(input: {
  ledger: WebResearchExecutionLedger
  event: WebResearchExecutionEventInput
}): WebResearchExecutionAppendResult {
  const eventId = text(input.event.eventId)
  const runId = text(input.event.runId)
  const actionReceiptId = text(input.event.actionReceiptId)
  const strategyFingerprint = text(input.event.strategyFingerprint, 80)
  const evidenceRefs = uniqueTextList(input.event.evidenceRefs)
  if (
    input.ledger.schemaVersion !== 1 ||
    !text(input.ledger.runId) ||
    !eventId ||
    !runId ||
    !actionReceiptId ||
    !strategyFingerprint ||
    !SHA256.test(strategyFingerprint) ||
    !METHODS.has(input.event.method) ||
    !["started", "succeeded", "failed", "cancelled"].includes(input.event.state) ||
    !evidenceRefs ||
    !Number.isSafeInteger(input.event.recordedAt) ||
    input.event.recordedAt < 0 ||
    (input.event.state === "started" && evidenceRefs.length !== 0) ||
    (input.event.state === "succeeded" && evidenceRefs.length === 0) ||
    ((input.event.state === "failed" || input.event.state === "cancelled") &&
      evidenceRefs.length !== 0)
  ) {
    return executionRejected("web_execution_event_invalid")
  }
  if (input.ledger.runId !== runId) {
    return executionRejected("web_execution_run_mismatch")
  }
  if (input.ledger.events.some((event) => event.eventId === eventId)) {
    return executionRejected("web_execution_event_duplicate")
  }

  const actionEvents = input.ledger.events.filter(
    (event) => event.actionReceiptId === actionReceiptId,
  )
  if (input.event.state === "started") {
    if (actionEvents.length > 0) {
      return executionRejected("web_execution_action_duplicate")
    }
  } else {
    const started = actionEvents.find((event) => event.state === "started")
    if (!started || actionEvents.some((event) => event.state !== "started")) {
      return executionRejected("web_execution_transition_invalid")
    }
    if (
      started.method !== input.event.method ||
      started.strategyFingerprint !== strategyFingerprint ||
      input.event.recordedAt < started.recordedAt
    ) {
      return executionRejected("web_execution_scope_mismatch")
    }
  }

  const event = Object.freeze({
    sequence: input.ledger.events.length + 1,
    eventId,
    runId,
    actionReceiptId,
    method: input.event.method,
    strategyFingerprint: strategyFingerprint as `sha256:${string}`,
    state: input.event.state,
    evidenceRefs,
    recordedAt: input.event.recordedAt,
  })
  return Object.freeze({
    ok: true,
    ledger: Object.freeze({
      schemaVersion: 1 as const,
      runId: input.ledger.runId,
      events: Object.freeze([...input.ledger.events, event]),
    }),
  })
}

export function createWebResearchEvidenceLedger(runId: string): WebResearchEvidenceLedger {
  const normalizedRunId = text(runId)
  if (!normalizedRunId) throw new Error("Web research evidence ledger run ID is invalid.")
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: normalizedRunId,
    entries: Object.freeze([]),
  })
}

export function appendWebResearchEvidence(input: {
  ledger: WebResearchEvidenceLedger
  executionLedger: WebResearchExecutionLedger
  entry: WebResearchEvidenceEntryInput
}): WebResearchEvidenceAppendResult {
  const entryId = text(input.entry.entryId)
  const runId = text(input.entry.runId)
  const evidenceRef = text(input.entry.evidenceRef)
  const parentActionReceiptId = text(input.entry.parentActionReceiptId)
  const provenanceRef = text(input.entry.provenanceRef)
  const parentEvidenceRefs = uniqueTextList(input.entry.parentEvidenceRefs)
  if (
    input.ledger.schemaVersion !== 1 ||
    input.executionLedger.schemaVersion !== 1 ||
    !entryId ||
    !runId ||
    !evidenceRef ||
    !parentActionReceiptId ||
    !provenanceRef ||
    !parentEvidenceRefs ||
    !METHODS.has(input.entry.method) ||
    (input.entry.kind !== "search_result" && input.entry.kind !== "document")
  ) {
    return evidenceRejected("web_evidence_entry_invalid")
  }
  if (input.ledger.runId !== runId || input.executionLedger.runId !== runId) {
    return evidenceRejected("web_evidence_run_mismatch")
  }
  if (input.ledger.entries.some((entry) => entry.entryId === entryId)) {
    return evidenceRejected("web_evidence_entry_duplicate")
  }
  if (input.ledger.entries.some((entry) => entry.evidenceRef === evidenceRef)) {
    return evidenceRejected("web_evidence_ref_duplicate")
  }
  const succeeded = input.executionLedger.events.find(
    (event) =>
      event.actionReceiptId === parentActionReceiptId &&
      event.state === "succeeded" &&
      event.method === input.entry.method &&
      event.evidenceRefs.includes(evidenceRef),
  )
  if (!succeeded) {
    return evidenceRejected("web_evidence_action_not_succeeded")
  }
  const priorEvidenceRefs = new Set(input.ledger.entries.map((entry) => entry.evidenceRef))
  if (parentEvidenceRefs.some((parentRef) => !priorEvidenceRefs.has(parentRef))) {
    return evidenceRejected("web_evidence_parent_missing")
  }

  const entry = Object.freeze({
    sequence: input.ledger.entries.length + 1,
    entryId,
    runId,
    evidenceRef,
    kind: input.entry.kind,
    method: input.entry.method,
    parentActionReceiptId,
    provenanceRef,
    parentEvidenceRefs,
  })
  return Object.freeze({
    ok: true,
    ledger: Object.freeze({
      schemaVersion: 1 as const,
      runId: input.ledger.runId,
      entries: Object.freeze([...input.ledger.entries, entry]),
    }),
  })
}

export function projectAttemptedWebResearchMethods(
  ledger: WebResearchExecutionLedger,
): WebRetrievalMethod[] {
  return ledger.events.filter((event) => event.state === "started").map((event) => event.method)
}
