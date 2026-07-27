import crypto from "node:crypto"
import { isExternalChannelProvider } from "../channels/contracts.js"
import { recordControlEventFromLedger } from "../control-plane/timeline.js"
import {
  type DbMessageLedgerEvent,
  type DbMessageLedgerStatus,
  getDb,
  getMessageLedgerEventByIdempotencyKey,
  insertDiagnosticEvent,
  insertMessageLedgerEvent,
  listMessageLedgerEvents,
  transitionMessageLedgerEvent,
} from "../db/index.js"
import { redactLogText } from "../logger/index.js"
import { redactInternalEvidenceText } from "../security/internal-evidence-redaction.js"
import type { RunStatus } from "./types.js"
import {
  type WebRetrievalTransitionAdmission,
  type WebRetrievalTransitionReceipt,
  buildWebRetrievalPolicyDecision,
  evaluateWebRetrievalTransitionAdmission,
} from "./web-retrieval-policy.js"

function messageLedgerErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export type MessageLedgerEventKind =
  | "ingress_admission_reserved"
  | "ingress_received"
  | "fast_receipt_sent"
  | "approval_requested"
  | "approval_received"
  | "tool_started"
  | "tool_done"
  | "tool_failed"
  | "tool_skipped"
  | "progress_message_sent"
  | "final_answer_generated"
  | "final_answer_delivered"
  | "final_answer_suppressed"
  | "final_validation_evaluated"
  | "text_delivered"
  | "text_delivery_failed"
  | "text_delivery_suppressed"
  | "artifact_delivered"
  | "artifact_delivery_failed"
  | "approval_aggregated"
  | "sub_session_created"
  | "sub_session_progress_summarized"
  | "sub_session_completed"
  | "sub_session_failed"
  | "sub_session_result_suppressed"
  | "data_exchange_recorded"
  | "capability_delegation_recorded"
  | "feedback_retry_recorded"
  | "learning_history_recorded"
  | "history_restore_recorded"
  | "agent_config_changed"
  | "team_config_changed"
  | "agent_config_exported"
  | "team_config_exported"
  | "agent_config_imported"
  | "team_config_imported"
  | "recovery_stop_generated"
  | "delivery_attempted"
  | "delivery_receipted"
  | "delivery_backoff_scheduled"
  | "channel_policy_evaluated"
  | "delivery_finalized"

export type MessageLedgerDeliveryKind =
  | "progress"
  | "final"
  | "artifact"
  | "approval"
  | "diagnostic"

export interface MessageLedgerEventInput {
  runId?: string | null
  parentRunId?: string | null
  requestGroupId?: string | null
  subSessionId?: string | null
  agentId?: string | null
  teamId?: string | null
  sessionKey?: string | null
  threadKey?: string | null
  channel?: string | null
  eventKind: MessageLedgerEventKind
  deliveryKey?: string | null
  idempotencyKey?: string | null
  deliveryKind?: MessageLedgerDeliveryKind | null
  status: DbMessageLedgerStatus
  summary: string
  detail?: Record<string, unknown>
  createdAt?: number
}

interface RunLedgerContext {
  runId: string
  requestGroupId: string | null
  sessionKey: string | null
  channel: string | null
}

export interface DeliveryFinalizerResult {
  shouldProtectDeliveredAnswer: boolean
  outcome: "unchanged" | "success" | "partial_success"
  runStatus?: RunStatus
  summary?: string
}

const DEDUPE_TOOL_NAMES = new Set([
  "web_fetch",
  "screen_capture",
  "telegram_send_file",
  "slack_send_file",
  "yeonjang_camera_capture",
])
const UNCHANGED_RECOVERY_REJECT_TOOL_NAMES = new Set([
  "yeonjang_camera_capture",
])
const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|token|secret|password|credential|authorization|cookie|raw[_-]?(?:body|response))/i

function resolveRunLedgerContext(runId: string | null | undefined): RunLedgerContext | undefined {
  if (!runId) return undefined
  return getDb()
    .prepare<[string], RunLedgerContext>(
      `SELECT id AS runId, request_group_id AS requestGroupId, session_id AS sessionKey, source AS channel
       FROM root_runs
       WHERE id = ?
       LIMIT 1`,
    )
    .get(runId)
}

function sanitizeLedgerDetail(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (depth > 8) return "[truncated]"
  if (typeof value === "string") return sanitizeLedgerText(value)
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => sanitizeLedgerDetail(item, depth + 1))
  if (typeof value !== "object") return value

  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      result[key] = "[redacted]"
      continue
    }
    result[key] = sanitizeLedgerDetail(nested, depth + 1)
  }
  return result
}

function sanitizeLedgerText(raw: string): string {
  return redactInternalEvidenceText(raw)
}

export function recordMessageLedgerEvent(input: MessageLedgerEventInput): string | null {
  try {
    const resolved = resolveRunLedgerContext(input.runId ?? input.parentRunId)
    const requestGroupId = input.requestGroupId ?? resolved?.requestGroupId ?? input.runId ?? null
    const sessionKey = input.sessionKey ?? resolved?.sessionKey ?? null
    const channel = input.channel ?? resolved?.channel ?? "unknown"
    const threadKey = input.threadKey ?? requestGroupId ?? input.runId ?? sessionKey ?? null
    const detailSource: Record<string, unknown> = {
      ...(input.detail ?? {}),
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      ...(input.subSessionId ? { subSessionId: input.subSessionId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.teamId ? { teamId: input.teamId } : {}),
      ...(input.deliveryKind ? { deliveryKind: input.deliveryKind } : {}),
    }
    const detail =
      Object.keys(detailSource).length > 0
        ? (sanitizeLedgerDetail(detailSource) as Record<string, unknown>)
        : undefined

    const id = insertMessageLedgerEvent({
      runId: input.runId ?? input.parentRunId ?? resolved?.runId ?? null,
      requestGroupId,
      sessionKey,
      threadKey,
      channel,
      eventKind: input.eventKind,
      deliveryKey: input.deliveryKey ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      status: input.status,
      summary: input.summary,
      ...(detail ? { detail } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    if (id) {
      recordControlEventFromLedger({
        runId: input.runId ?? input.parentRunId ?? resolved?.runId ?? null,
        requestGroupId,
        sessionKey,
        channel,
        eventKind: input.eventKind,
        deliveryKey: input.deliveryKey ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        status: input.status,
        summary: input.summary,
        ...(detail ? { detail } : {}),
      })
    }
    return id
  } catch (error) {
    try {
      const message = messageLedgerErrorMessage(error)
      insertDiagnosticEvent({
        kind: "message_ledger_degraded",
        summary: `message ledger write failed: ${message}`,
        detail: {
          eventKind: input.eventKind,
          runId: input.runId ?? null,
          requestGroupId: input.requestGroupId ?? null,
        },
      })
    } catch {
      // Admission callers detect null and fail closed; diagnostic-only callers remain best-effort.
    }
    return null
  }
}

export function findMessageLedgerEventByIdempotencyKey(
  idempotencyKey: string | null | undefined,
): DbMessageLedgerEvent | undefined {
  const key = idempotencyKey?.trim()
  if (!key) return undefined
  return getMessageLedgerEventByIdempotencyKey(key)
}

export type IngressAdmissionReservation =
  | { status: "admitted" }
  | { status: "existing"; runId: string }
  | { status: "persistence_unavailable" }

export function reserveIngressAdmission(input: {
  idempotencyKey: string
  runId: string
  sessionId: string
  source: string
}): IngressAdmissionReservation {
  const idempotencyKey = input.idempotencyKey.trim()
  if (!idempotencyKey) return { status: "persistence_unavailable" }
  const eventId = recordMessageLedgerEvent({
    runId: input.runId,
    requestGroupId: input.runId,
    sessionKey: input.sessionId,
    channel: input.source,
    eventKind: "ingress_admission_reserved",
    idempotencyKey,
    status: "started",
    summary: "Ingress execution admitted.",
  })
  if (eventId) return { status: "admitted" }
  const existing = findMessageLedgerEventByIdempotencyKey(idempotencyKey)
  return existing?.run_id
    ? { status: "existing", runId: existing.run_id }
    : { status: "persistence_unavailable" }
}

function parseWebRetrievalTransitionReceipt(value: unknown): WebRetrievalTransitionReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== 1) return null
  if (record.kind !== "discovery" && record.kind !== "direct_fetch_attempt") return null
  if (!Array.isArray(record.candidateRefs)) return null
  const candidateRefs = record.candidateRefs.filter(
    (item): item is string => typeof item === "string" && item.startsWith("web-candidate:"),
  )
  if (candidateRefs.length !== record.candidateRefs.length) return null
  return { schemaVersion: 1, kind: record.kind, candidateRefs }
}

export function evaluatePersistedWebRetrievalTransition(input: {
  requestGroupId: string
  nextToolName: string
}): WebRetrievalTransitionAdmission {
  const receipts = listMessageLedgerEvents({
    requestGroupId: input.requestGroupId,
    limit: 1000,
  }).flatMap((event) => {
    if (!event.detail_json) return []
    try {
      const detail = JSON.parse(event.detail_json) as Record<string, unknown>
      const receipt = parseWebRetrievalTransitionReceipt(detail.webRetrievalTransition)
      return receipt ? [receipt] : []
    } catch {
      return []
    }
  })
  return evaluateWebRetrievalTransitionAdmission({
    nextToolName: input.nextToolName,
    receipts,
  })
}

export type MessageDeliveryAdmissionResult =
  | { status: "admitted"; eventId: string }
  | { status: "existing"; event: DbMessageLedgerEvent }
  | { status: "persistence_unavailable" }

export function reserveMessageDeliveryAdmission(
  input: Omit<MessageLedgerEventInput, "eventKind" | "status" | "summary">,
): MessageDeliveryAdmissionResult {
  const idempotencyKey = input.idempotencyKey?.trim()
  if (!idempotencyKey) return { status: "persistence_unavailable" }
  const eventId = recordMessageLedgerEvent({
    ...input,
    idempotencyKey,
    eventKind: "delivery_attempted",
    status: "started",
    summary: "final delivery admitted",
  })
  if (eventId) return { status: "admitted", eventId }
  const existing = findMessageLedgerEventByIdempotencyKey(idempotencyKey)
  return existing ? { status: "existing", event: existing } : { status: "persistence_unavailable" }
}

export function completeMessageDeliveryAdmission(input: {
  idempotencyKey: string
  delivered: boolean
  detail?: Record<string, unknown>
}): boolean {
  try {
    return transitionMessageLedgerEvent({
      idempotencyKey: input.idempotencyKey,
      expectedEventKind: "delivery_attempted",
      expectedStatus: "started",
      eventKind: input.delivered ? "text_delivered" : "text_delivery_failed",
      status: input.delivered ? "delivered" : "failed",
      summary: input.delivered ? "응답 텍스트 전달 완료" : "응답 텍스트 전달 실패",
      ...(input.detail
        ? { detail: sanitizeLedgerDetail(input.detail) as Record<string, unknown> }
        : {}),
    })
  } catch (error) {
    try {
      insertDiagnosticEvent({
        kind: "message_ledger_degraded",
        summary: `delivery admission transition failed: ${messageLedgerErrorMessage(error)}`,
        detail: { delivered: input.delivered },
      })
    } catch {
      // The caller treats a failed compare-and-set as an unresolved delivery.
    }
    return false
  }
}

export function cancelMessageDeliveryAdmission(input: {
  idempotencyKey: string
  detail?: Record<string, unknown>
}): boolean {
  try {
    return transitionMessageLedgerEvent({
      idempotencyKey: input.idempotencyKey,
      expectedEventKind: "delivery_attempted",
      expectedStatus: "started",
      eventKind: "text_delivery_suppressed",
      status: "suppressed",
      summary: "final delivery cancelled before provider invocation",
      ...(input.detail
        ? { detail: sanitizeLedgerDetail(input.detail) as Record<string, unknown> }
        : {}),
    })
  } catch {
    return false
  }
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`
}

export function hashLedgerValue(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex")
}

function normalizeChannelTarget(target: string | null | undefined): string {
  return target?.trim() || "default"
}

export function buildTextDeliveryKey(
  channel: string | null | undefined,
  target: string | null | undefined,
  text: string,
): string {
  return `text:${channel ?? "unknown"}:${normalizeChannelTarget(target)}:${hashLedgerValue(text.trim())}`
}

export function buildArtifactDeliveryKey(
  channel: string | null | undefined,
  target: string | null | undefined,
  artifactPath: string,
): string {
  return `artifact:${channel ?? "unknown"}:${normalizeChannelTarget(target)}:${hashLedgerValue(artifactPath)}`
}

function canonicalToolParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (key === "allowRepeatReason") continue
    result[key] = value
  }
  return result
}

export function isDedupeTargetTool(toolName: string): boolean {
  return DEDUPE_TOOL_NAMES.has(toolName)
}

export function rejectsDuplicateAsUnchangedRecovery(toolName: string): boolean {
  return UNCHANGED_RECOVERY_REJECT_TOOL_NAMES.has(toolName)
}

export function getAllowRepeatReason(params: Record<string, unknown>): string | undefined {
  const value = params.allowRepeatReason
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

export function buildToolCallIdempotencyKey(input: {
  runId?: string | null
  requestGroupId?: string | null
  toolName: string
  params: Record<string, unknown>
}): string {
  const owner = input.requestGroupId ?? input.runId ?? "unknown-run"
  const hash = hashLedgerValue({
    toolName: input.toolName,
    params: canonicalToolParams(input.params),
  })
  return `tool:${owner}:${input.toolName}:${hash}`
}

export function findDuplicateToolCall(input: {
  runId?: string | null
  requestGroupId?: string | null
  toolName: string
  params: Record<string, unknown>
}): DbMessageLedgerEvent | undefined {
  const baseKey = buildToolCallIdempotencyKey(input)
  const webRetrievalPolicy = buildWebRetrievalPolicyDecision({
    toolName: input.toolName,
    params: input.params,
  })
  const keys = [
    baseKey,
    ...(webRetrievalPolicy
      ? [
          buildToolCallIdempotencyKey({
            ...input,
            params: webRetrievalPolicy.canonicalParams,
          }),
        ]
      : []),
  ]
  for (const key of [...new Set(keys)]) {
    const duplicate =
      getMessageLedgerEventByIdempotencyKey(`${key}:result`) ??
      getMessageLedgerEventByIdempotencyKey(`${key}:started`)
    if (duplicate) return duplicate
  }
  return undefined
}

function eventSucceeded(event: DbMessageLedgerEvent): boolean {
  return event.status === "sent" || event.status === "delivered" || event.status === "succeeded"
}

export function messageLedgerEventSucceeded(
  event: DbMessageLedgerEvent | null | undefined,
): boolean {
  return Boolean(event && eventSucceeded(event))
}

export function messageLedgerEventHasRequiredDeliveryEvidence(
  event: DbMessageLedgerEvent | null | undefined,
): boolean {
  if (!event) return false
  if (!isExternalChannelProvider(event.channel)) return true
  if (!event.detail_json) return false
  try {
    const detail = JSON.parse(event.detail_json) as Record<string, unknown>
    return detail.providerEvidence === "confirmed"
  } catch {
    return false
  }
}

function eventFailed(event: DbMessageLedgerEvent): boolean {
  return (
    event.status === "failed" ||
    event.status === "suppressed" ||
    event.event_kind.endsWith("_failed") ||
    event.event_kind === "recovery_stop_generated"
  )
}

export function finalizeDeliveryForRun(params: {
  runId: string
  requestedStatus: RunStatus
  requestedSummary?: string
}): DeliveryFinalizerResult {
  if (
    params.requestedStatus !== "failed" &&
    params.requestedStatus !== "cancelled" &&
    params.requestedStatus !== "interrupted"
  ) {
    return { shouldProtectDeliveredAnswer: false, outcome: "unchanged" }
  }

  const resolved = resolveRunLedgerContext(params.runId)
  const events = listMessageLedgerEvents({
    ...(resolved?.requestGroupId
      ? { requestGroupId: resolved.requestGroupId }
      : { runId: params.runId }),
    limit: 1000,
  })
  const hasDeliveredAnswer = events.some(
    (event) =>
      event.event_kind === "text_delivered" &&
      eventSucceeded(event) &&
      messageLedgerEventHasRequiredDeliveryEvidence(event),
  )
  if (!hasDeliveredAnswer) return { shouldProtectDeliveredAnswer: false, outcome: "unchanged" }

  const hasLaterFailure = events.some(eventFailed)
  const outcome = hasLaterFailure ? "partial_success" : "success"
  const summary =
    outcome === "partial_success"
      ? "응답은 이미 전달됐고, 후속 전달/복구 실패는 부분 실패로 기록했습니다."
      : "응답 전달이 완료되어 후속 실패가 전체 실패로 덮어써지지 않았습니다."

  recordMessageLedgerEvent({
    runId: params.runId,
    requestGroupId: resolved?.requestGroupId ?? params.runId,
    sessionKey: resolved?.sessionKey ?? null,
    channel: resolved?.channel ?? null,
    eventKind: "delivery_finalized",
    idempotencyKey: `delivery-finalized:${params.runId}:${params.requestedStatus}:${outcome}`,
    status: outcome === "partial_success" ? "degraded" : "succeeded",
    summary,
    detail: {
      requestedStatus: params.requestedStatus,
      requestedSummary: params.requestedSummary ?? null,
      outcome,
    },
  })

  return {
    shouldProtectDeliveredAnswer: true,
    outcome,
    runStatus: "completed",
    summary,
  }
}
