import type { DbChannelMessageRef, DbMessageLedgerEvent } from "../db/index.js"
import {
  findChannelMessageRef,
  getDb,
} from "../db/index.js"
import type { InboundEnvelope } from "./contracts.js"

export type ChannelContinuationLookupStatus = "resolved" | "ambiguous" | "not_found"
export type ChannelContinuationNoticeLanguage = "ko" | "en"
export type ChannelContinuationCandidateSource =
  | "explicit_run_id"
  | "explicit_task_id"
  | "delivery_id"
  | "message_ref_exact"
  | "message_ref_parent"

export interface ChannelContinuationLookupCandidate {
  source: ChannelContinuationCandidateSource
  runId: string
  requestGroupId: string
  sessionId?: string | undefined
  messageRef?: DbChannelMessageRef | undefined
  externalChatId?: string | undefined
  externalThreadId?: string | null | undefined
  externalMessageId?: string | undefined
  deliveryKey?: string | undefined
  confidence: "exact" | "high" | "medium" | "low"
  createdAt: number
}

export interface ChannelContinuationConfirmationNotice {
  kind: "channel_continuation_confirmation_required"
  candidateCount: number
  language: ChannelContinuationNoticeLanguage
  text: string
  deliveryMode: "receipt"
  textSource: "channel_continuation_control_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

export interface ChannelContinuationLookupResult {
  status: ChannelContinuationLookupStatus
  candidates: ChannelContinuationLookupCandidate[]
  selected?: ChannelContinuationLookupCandidate | undefined
  confirmationRequired: boolean
  confirmationNotice?: ChannelContinuationConfirmationNotice | undefined
  confirmationPrompt?: string | undefined
  reasonCode:
    | "explicit_match"
    | "message_match"
    | "ambiguous_candidates"
    | "no_candidates"
}

export interface ChannelContinuationLookupInput {
  envelope: InboundEnvelope
  taskId?: string | undefined
  runId?: string | undefined
  deliveryId?: string | undefined
  lookupWindowMs?: number | undefined
  language?: ChannelContinuationNoticeLanguage | undefined
}

export function resolveChannelContinuation(input: ChannelContinuationLookupInput): ChannelContinuationLookupResult {
  void input.lookupWindowMs
  const candidates: ChannelContinuationLookupCandidate[] = []
  const explicitRunId = input.runId ?? input.envelope.continuationContext?.runId
  const explicitTaskId = input.taskId ?? input.envelope.continuationContext?.taskId
  const explicitDeliveryId = input.deliveryId ?? input.envelope.continuationContext?.parentDeliveryId

  if (explicitRunId) pushCandidate(candidates, candidateFromRunId(explicitRunId, "explicit_run_id"))
  if (explicitTaskId) pushCandidate(candidates, candidateFromRunId(explicitTaskId, "explicit_task_id"))
  if (explicitDeliveryId) {
    for (const candidate of candidatesFromDeliveryId(explicitDeliveryId)) pushCandidate(candidates, candidate)
  }

  const roomId = input.envelope.room?.id
  if (roomId) {
    const exactIncomingRef = findChannelMessageRef({
      source: input.envelope.provider,
      externalChatId: roomId,
      externalMessageId: input.envelope.messageId,
      ...(input.envelope.threadId ? { externalThreadId: input.envelope.threadId } : {}),
    })
    pushCandidate(candidates, candidateFromMessageRef(exactIncomingRef, "message_ref_exact", "exact"))
    if (exactIncomingRef) return finalizeContinuationResult(candidates, input.language)

    const parentMessageId = input.envelope.continuationContext?.source === "thread"
      ? undefined
      : input.envelope.replyToMessageId ?? input.envelope.continuationContext?.parentMessageId
    if (parentMessageId) {
      const parentRef = findChannelMessageRef({
        source: input.envelope.provider,
        externalChatId: roomId,
        externalMessageId: parentMessageId,
        ...(input.envelope.threadId ? { externalThreadId: input.envelope.threadId } : {}),
      })
      pushCandidate(candidates, candidateFromMessageRef(parentRef, "message_ref_parent", "exact"))
      if (parentRef) return finalizeContinuationResult(candidates, input.language)
    }
  }

  return finalizeContinuationResult(candidates, input.language)
}

export function resolveChannelContinuationNoticeLanguage(
  languageCode: string | undefined,
): ChannelContinuationNoticeLanguage {
  return languageCode?.toLowerCase().startsWith("ko") ? "ko" : "en"
}

export function buildContinuationConfirmationNotice(
  candidates: ChannelContinuationLookupCandidate[],
  options: { language?: ChannelContinuationNoticeLanguage | undefined } = {},
): ChannelContinuationConfirmationNotice {
  const count = candidates.length
  const language = options.language ?? "en"
  return {
    kind: "channel_continuation_confirmation_required",
    candidateCount: count,
    language,
    text: language === "ko"
      ? `이 메시지를 연결할 수 있는 이전 작업이 ${count}개 있습니다. 어느 작업을 이어갈지 먼저 선택해 주세요.`
      : `Found ${count} possible previous contexts. Please choose which task to continue before this message is attached.`,
    deliveryMode: "receipt",
    textSource: "channel_continuation_control_notice",
    renderingRequired: "llm_final_response",
    finalAnswer: false,
    assistantIdentityClaim: false,
  }
}

export function buildContinuationConfirmationPrompt(
  candidates: ChannelContinuationLookupCandidate[],
  options: { language?: ChannelContinuationNoticeLanguage | undefined } = {},
): string {
  return buildContinuationConfirmationNotice(candidates, options).text
}

function finalizeContinuationResult(
  candidates: ChannelContinuationLookupCandidate[],
  language: ChannelContinuationNoticeLanguage | undefined,
): ChannelContinuationLookupResult {
  const unique = uniqueCandidates(candidates)
  if (unique.length === 0) {
    return {
      status: "not_found",
      candidates: [],
      confirmationRequired: false,
      reasonCode: "no_candidates",
    }
  }

  const exact = unique.filter((candidate) => candidate.confidence === "exact")
  const selectedPool = exact.length > 0 ? exact : unique
  const groupedByRequest = new Map<string, ChannelContinuationLookupCandidate[]>()
  for (const candidate of selectedPool) {
    const key = candidate.requestGroupId || candidate.runId
    const existing = groupedByRequest.get(key)
    if (existing) existing.push(candidate)
    else groupedByRequest.set(key, [candidate])
  }

  if (groupedByRequest.size === 1) {
    const selected = [...groupedByRequest.values()][0]!
      .sort((left, right) => rankCandidate(right) - rankCandidate(left) || right.createdAt - left.createdAt)[0]!
    return {
      status: "resolved",
      candidates: unique,
      selected,
      confirmationRequired: false,
      reasonCode: selected.source.startsWith("explicit")
        ? "explicit_match"
        : "message_match",
    }
  }

  const confirmationNotice = buildContinuationConfirmationNotice(unique, { language })
  return {
    status: "ambiguous",
    candidates: unique,
    confirmationRequired: true,
    confirmationNotice,
    confirmationPrompt: confirmationNotice.text,
    reasonCode: "ambiguous_candidates",
  }
}

function candidateFromRunId(
  runId: string,
  source: "explicit_run_id" | "explicit_task_id",
): ChannelContinuationLookupCandidate | null {
  const normalized = runId.trim()
  if (!normalized) return null
  const row = getDb()
    .prepare<[string, string], { id: string; request_group_id: string | null; session_id: string | null; created_at: number | null }>(
      `SELECT id, request_group_id, session_id, created_at
       FROM root_runs
       WHERE id = ? OR request_group_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(normalized, normalized)
  if (!row) return null
  return {
    source,
    runId: row.id,
    requestGroupId: row.request_group_id ?? row.id,
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    confidence: "exact",
    createdAt: row.created_at ?? Date.now(),
  }
}

function candidatesFromDeliveryId(deliveryId: string): ChannelContinuationLookupCandidate[] {
  const normalized = deliveryId.trim()
  if (!normalized) return []
  const rows = getDb()
    .prepare<[string, string], DbMessageLedgerEvent>(
      `SELECT *
       FROM message_ledger
       WHERE delivery_key = ? OR id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .all(normalized, normalized)
  return rows
    .map((event) => candidateFromLedgerEvent(event, "delivery_id"))
    .filter((candidate): candidate is ChannelContinuationLookupCandidate => candidate !== null)
}

function candidateFromLedgerEvent(
  event: DbMessageLedgerEvent,
  source: ChannelContinuationCandidateSource,
): ChannelContinuationLookupCandidate | null {
  if (!event.run_id && !event.request_group_id) return null
  const runId = event.run_id ?? event.request_group_id
  if (!runId) return null
  return {
    source,
    runId,
    requestGroupId: event.request_group_id ?? runId,
    ...(event.session_key ? { sessionId: event.session_key } : {}),
    ...(event.delivery_key ? { deliveryKey: event.delivery_key } : {}),
    confidence: "exact",
    createdAt: event.created_at,
  }
}

function candidateFromMessageRef(
  ref: DbChannelMessageRef | undefined,
  source: ChannelContinuationCandidateSource,
  confidence: ChannelContinuationLookupCandidate["confidence"],
): ChannelContinuationLookupCandidate | null {
  if (!ref) return null
  return {
    source,
    runId: ref.root_run_id,
    requestGroupId: ref.request_group_id,
    sessionId: ref.session_id,
    messageRef: ref,
    externalChatId: ref.external_chat_id,
    externalThreadId: ref.external_thread_id,
    externalMessageId: ref.external_message_id,
    confidence,
    createdAt: ref.created_at,
  }
}

function pushCandidate(
  candidates: ChannelContinuationLookupCandidate[],
  candidate: ChannelContinuationLookupCandidate | null,
): void {
  if (!candidate) return
  candidates.push(candidate)
}

function uniqueCandidates(candidates: ChannelContinuationLookupCandidate[]): ChannelContinuationLookupCandidate[] {
  const byKey = new Map<string, ChannelContinuationLookupCandidate>()
  for (const candidate of candidates) {
    const key = [
      candidate.runId,
      candidate.requestGroupId,
      candidate.externalMessageId ?? "",
      candidate.deliveryKey ?? "",
    ].join(":")
    const existing = byKey.get(key)
    if (!existing || rankCandidate(candidate) > rankCandidate(existing) || candidate.createdAt > existing.createdAt) {
      byKey.set(key, candidate)
    }
  }
  return [...byKey.values()].sort((left, right) => rankCandidate(right) - rankCandidate(left) || right.createdAt - left.createdAt)
}

function rankCandidate(candidate: ChannelContinuationLookupCandidate): number {
  switch (candidate.confidence) {
    case "exact":
      return 4
    case "high":
      return 3
    case "medium":
      return 2
    case "low":
      return 1
  }
}
