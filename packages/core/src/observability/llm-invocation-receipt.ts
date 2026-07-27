export const LLM_INVOCATION_RECEIPT_SCHEMA_VERSION = 1 as const

export type LlmInvocationStage =
  | "intake"
  | "planning"
  | "execution"
  | "review"
  | "final_response"
  | "maintenance"
  | "other"

export type LlmInvocationPhase = "started" | "completed" | "failed" | "cancelled"
export type LlmInvocationTerminalReasonCode =
  | "provider_error"
  | "provider_contract_rejected"
  | "provider_unavailable"
  | "transport_failed"
  | "aborted"
  | "consumer_closed"

export interface LlmInvocationContext {
  runId?: string | undefined
  requestGroupId?: string | undefined
  sessionId?: string | undefined
  stage: LlmInvocationStage
  operationCode: string
}

export interface LlmInvocationReceipt {
  schemaVersion: typeof LLM_INVOCATION_RECEIPT_SCHEMA_VERSION
  invocationId: string
  phase: LlmInvocationPhase
  at: number
  context: Readonly<LlmInvocationContext>
  durationMs?: number | undefined
  inputTokens?: number | undefined
  outputTokens?: number | undefined
  reasonCode?: LlmInvocationTerminalReasonCode | undefined
}

export type LlmInvocationReceiptRejectionReason =
  | "schema_version_unsupported"
  | "invocation_id_required"
  | "timestamp_invalid"
  | "correlation_required"
  | "stage_invalid"
  | "operation_code_invalid"
  | "terminal_duration_required"
  | "started_terminal_field_forbidden"
  | "token_count_invalid"
  | "terminal_reason_invalid"

export type BuildLlmInvocationReceiptResult =
  | { status: "ready"; receipt: LlmInvocationReceipt }
  | { status: "rejected"; reasonCode: LlmInvocationReceiptRejectionReason }

const OPERATION_CODE = /^[a-z][a-z0-9_]{1,63}$/u
const INVOCATION_STAGES = new Set<LlmInvocationStage>([
  "intake",
  "planning",
  "execution",
  "review",
  "final_response",
  "maintenance",
  "other",
])
const TERMINAL_PHASES = new Set<LlmInvocationPhase>(["completed", "failed", "cancelled"])
const MAX_TOKEN_COUNT = 1_000_000_000

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function validTokenCount(value: number | undefined): boolean {
  return (
    value === undefined || (Number.isSafeInteger(value) && value >= 0 && value <= MAX_TOKEN_COUNT)
  )
}

export function buildLlmInvocationReceipt(
  input: LlmInvocationReceipt,
): BuildLlmInvocationReceiptResult {
  if (input.schemaVersion !== LLM_INVOCATION_RECEIPT_SCHEMA_VERSION) {
    return { status: "rejected", reasonCode: "schema_version_unsupported" }
  }
  if (!nonEmpty(input.invocationId)) {
    return { status: "rejected", reasonCode: "invocation_id_required" }
  }
  if (!Number.isSafeInteger(input.at) || input.at < 0) {
    return { status: "rejected", reasonCode: "timestamp_invalid" }
  }
  if (!nonEmpty(input.context.runId) && !nonEmpty(input.context.requestGroupId)) {
    return { status: "rejected", reasonCode: "correlation_required" }
  }
  if (!INVOCATION_STAGES.has(input.context.stage)) {
    return { status: "rejected", reasonCode: "stage_invalid" }
  }
  if (!OPERATION_CODE.test(input.context.operationCode)) {
    return { status: "rejected", reasonCode: "operation_code_invalid" }
  }
  const terminal = TERMINAL_PHASES.has(input.phase)
  if (terminal && (!Number.isSafeInteger(input.durationMs) || (input.durationMs ?? -1) < 0)) {
    return { status: "rejected", reasonCode: "terminal_duration_required" }
  }
  if (
    input.phase === "started" &&
    (input.durationMs !== undefined ||
      input.inputTokens !== undefined ||
      input.outputTokens !== undefined ||
      input.reasonCode !== undefined)
  ) {
    return { status: "rejected", reasonCode: "started_terminal_field_forbidden" }
  }
  if (!validTokenCount(input.inputTokens) || !validTokenCount(input.outputTokens)) {
    return { status: "rejected", reasonCode: "token_count_invalid" }
  }
  if (input.phase === "completed" && input.reasonCode !== undefined) {
    return { status: "rejected", reasonCode: "terminal_reason_invalid" }
  }
  if ((input.phase === "failed" || input.phase === "cancelled") && !input.reasonCode) {
    return { status: "rejected", reasonCode: "terminal_reason_invalid" }
  }
  return {
    status: "ready",
    receipt: Object.freeze({
      ...input,
      invocationId: input.invocationId.trim(),
      context: Object.freeze({
        ...(input.context.runId ? { runId: input.context.runId.trim() } : {}),
        ...(input.context.requestGroupId
          ? { requestGroupId: input.context.requestGroupId.trim() }
          : {}),
        ...(input.context.sessionId ? { sessionId: input.context.sessionId.trim() } : {}),
        stage: input.context.stage,
        operationCode: input.context.operationCode,
      }),
    }),
  }
}
