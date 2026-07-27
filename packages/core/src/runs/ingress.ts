import {
  type IntakeAcknowledgementControl,
  type IntakeAcknowledgementLanguage,
  buildIntakeAcknowledgementControl,
} from "../channels/intake-acknowledgement-control.js"
import { detectPrimaryMessageLanguage } from "../channels/language.js"
import { recordLatencyMetric } from "../observability/latency.js"
import { type IngressAdmissionReservation, reserveIngressAdmission } from "./message-ledger.js"
import { type InboundMessageRecord, createInboundMessageRecord } from "./request-isolation.js"
import { type StartRootRunParams, type StartedRootRun, startRootRun } from "./start.js"
import { getRootRun } from "./store.js"
import type { RootRun } from "./types.js"

export type IngressReceiptLanguage = IntakeAcknowledgementLanguage

export interface IngressExternalIdentity {
  source: StartRootRunParams["source"]
  sessionId: string
  externalChatId?: string | number | undefined
  externalThreadId?: string | number | undefined
  externalMessageId?: string | number | undefined
}

export interface SubmitUserRequestTransport {
  source: StartRootRunParams["source"]
  channelEventId: string
  externalChatId?: string | number | undefined
  externalThreadId?: string | number | null | undefined
  externalMessageId?: string | number | undefined
  userId?: string | number | null | undefined
  receivedAt?: number | undefined
}

export type SubmitUserRequestInput = Omit<StartRootRunParams, "source" | "inboundMessage"> & {
  transport: SubmitUserRequestTransport
}

export interface StartedIngressRun {
  requestId: string
  sessionId: string
  source: StartRootRunParams["source"]
  inboundMessage: InboundMessageRecord
  acknowledgement: IntakeAcknowledgementControl
  started: StartedRootRun
  admission?: {
    status: "admitted" | "duplicate"
    idempotencyKey: string
    originalRunId?: string
  }
}

export interface IngressRunDependencies {
  startRootRun: (params: StartRootRunParams) => StartedRootRun
  monotonicNow?: () => number
  reserveIngressAdmission?: (input: {
    idempotencyKey: string
    runId: string
    sessionId: string
    source: string
  }) => IngressAdmissionReservation
  getRootRun?: (runId: string) => RootRun | undefined
}

export const defaultIngressRunDependencies: IngressRunDependencies = {
  startRootRun,
  monotonicNow: () => performance.now(),
  reserveIngressAdmission,
  getRootRun,
}

export interface ResolvedIngressStartParams extends StartRootRunParams {
  runId: string
  sessionId: string
  inboundMessage: InboundMessageRecord
}

function normalizeIngressIdentityPart(value: string | number | undefined): string {
  return value == null ? "-" : String(value).trim() || "-"
}

export function buildIngressDedupeKey(identity: IngressExternalIdentity): string {
  // knowbee-critical-decision-audit: ingress.external_identity_dedupe
  // Preferred fast path: dedupe by channel ids, never by natural-language message text.
  return [
    identity.source,
    identity.sessionId,
    normalizeIngressIdentityPart(identity.externalChatId),
    normalizeIngressIdentityPart(identity.externalThreadId),
    normalizeIngressIdentityPart(identity.externalMessageId),
  ].join(":")
}

function detectIngressReceiptLanguage(message: string): IngressReceiptLanguage {
  return detectPrimaryMessageLanguage(message)
}

export function buildIngressAcknowledgement(message: string): IntakeAcknowledgementControl {
  return buildIntakeAcknowledgementControl(detectIngressReceiptLanguage(message))
}

// Ingress is responsible for fixing the external request identity before the
// heavier run loop begins. Downstream code should receive resolved identifiers.
export function resolveIngressStartParams(params: StartRootRunParams): ResolvedIngressStartParams {
  const runId = params.runId ?? crypto.randomUUID()
  const sessionId = params.sessionId ?? crypto.randomUUID()
  return {
    ...params,
    runId,
    sessionId,
    inboundMessage:
      params.inboundMessage ??
      createInboundMessageRecord({
        source: params.source,
        sessionId,
        channelEventId: runId,
        externalMessageId: runId,
        rawText: params.message,
      }),
  }
}

export function buildSubmitUserRequestCommand(
  input: SubmitUserRequestInput,
): ResolvedIngressStartParams {
  const { transport, ...execution } = input
  const runId = execution.runId ?? crypto.randomUUID()
  const sessionId = execution.sessionId ?? crypto.randomUUID()
  return {
    ...execution,
    runId,
    sessionId,
    source: transport.source,
    inboundMessage: createInboundMessageRecord({
      source: transport.source,
      sessionId,
      channelEventId: transport.channelEventId,
      externalChatId: transport.externalChatId,
      externalThreadId: transport.externalThreadId,
      externalMessageId: transport.externalMessageId,
      userId: transport.userId,
      rawText: execution.message,
      receivedAt: transport.receivedAt,
    }),
  }
}

export function submitUserRequest(
  input: SubmitUserRequestInput,
  dependencies: IngressRunDependencies = defaultIngressRunDependencies,
): StartedIngressRun {
  const command = buildSubmitUserRequestCommand(input)
  const idempotencyKey = `ingress-request:${command.inboundMessage.messageKey}`
  const reservation = dependencies.reserveIngressAdmission?.({
    idempotencyKey,
    runId: command.runId,
    sessionId: command.sessionId,
    source: command.source,
  }) ?? { status: "admitted" as const }
  if (reservation.status === "persistence_unavailable") {
    throw new IngressAdmissionError("ingress_admission_persistence_unavailable")
  }
  if (reservation.status === "existing") {
    const existingRun = dependencies.getRootRun?.(reservation.runId)
    const acknowledgement = buildIngressAcknowledgement(command.message)
    return {
      requestId: reservation.runId,
      sessionId: existingRun?.sessionId ?? command.sessionId,
      source: command.source,
      inboundMessage: command.inboundMessage,
      acknowledgement,
      started: {
        runId: reservation.runId,
        sessionId: existingRun?.sessionId ?? command.sessionId,
        status: "started",
        finished: Promise.resolve(existingRun),
      },
      admission: {
        status: "duplicate",
        idempotencyKey,
        originalRunId: reservation.runId,
      },
    }
  }
  return {
    ...startIngressRun(command, dependencies),
    admission: { status: "admitted", idempotencyKey },
  }
}

export class IngressAdmissionError extends Error {
  readonly reasonCode: "ingress_admission_persistence_unavailable"

  constructor(reasonCode: "ingress_admission_persistence_unavailable") {
    super(reasonCode)
    this.name = "IngressAdmissionError"
    this.reasonCode = reasonCode
  }
}

// Ingress owns the immediate acknowledgement boundary.
// Downstream execution keeps using startRootRun, but channel/API entry points
// should start from this helper instead of assembling receipt logic themselves.
export function startIngressRun(
  params: StartRootRunParams,
  dependencies: IngressRunDependencies = defaultIngressRunDependencies,
): StartedIngressRun {
  const firstResponseReceivedAtMs =
    params.firstResponseReceivedAtMs ??
    (dependencies.monotonicNow ?? defaultIngressRunDependencies.monotonicNow ?? performance.now)()
  const startedAt = Date.now()
  const resolved = resolveIngressStartParams(params)
  const inboundMessage = resolved.inboundMessage
  const acknowledgement = buildIngressAcknowledgement(resolved.message)
  recordLatencyMetric({
    name: "ingress_ack_latency_ms",
    durationMs: Date.now() - startedAt,
    runId: resolved.runId,
    sessionId: resolved.sessionId,
    source: resolved.source,
  })
  return {
    requestId: resolved.runId,
    sessionId: resolved.sessionId,
    source: resolved.source,
    inboundMessage,
    acknowledgement,
    started: dependencies.startRootRun({
      ...resolved,
      inboundMessage,
      firstResponseReceivedAtMs,
    }),
  }
}
