export type YeonjangCommandAttemptTerminalStage =
  | "rejected"
  | "handler_failed"
  | "helper_timeout"
  | "handler_timeout"
  | "cancelled"
  | "response_ready"
  | "response_timeout"

export type YeonjangCommandAttemptRetrySafety =
  | "safe_same_command"
  | "change_strategy"
  | "unknown_effect_state"
  | "completed"

export interface YeonjangCommandAttemptEvidence {
  readonly schemaVersion: 1
  readonly method: string
  readonly commandId: string
  readonly operationId?: string
  readonly targetFingerprint?: `sha256:${string}`
  readonly terminalStage: YeonjangCommandAttemptTerminalStage
  readonly reasonCode: string
  readonly retrySafety: YeonjangCommandAttemptRetrySafety
}

interface YeonjangCommandAttemptWireV1 {
  readonly schema_version: 1
  readonly method: string
  readonly command_id: string
  readonly operation_id?: string
  readonly target_fingerprint?: string
  readonly terminal_stage: YeonjangCommandAttemptTerminalStage
  readonly reason_code: string
  readonly retry_safety: YeonjangCommandAttemptRetrySafety
}

const TERMINAL_STAGES = new Set<YeonjangCommandAttemptTerminalStage>([
  "rejected",
  "handler_failed",
  "helper_timeout",
  "handler_timeout",
  "cancelled",
  "response_ready",
  "response_timeout",
])

const RETRY_SAFETY_VALUES = new Set<YeonjangCommandAttemptRetrySafety>([
  "safe_same_command",
  "change_strategy",
  "unknown_effect_state",
  "completed",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function optionalNonEmptyString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined
  return nonEmptyString(value)
}

function targetFingerprint(value: unknown): `sha256:${string}` | undefined | null {
  if (value === undefined) return undefined
  const normalized = nonEmptyString(value)
  if (!normalized || !/^sha256:[a-f0-9]{64}$/.test(normalized)) return null
  return normalized as `sha256:${string}`
}

export function parseYeonjangCommandAttemptEvidence(
  value: unknown,
): YeonjangCommandAttemptEvidence | null {
  if (!isRecord(value) || value.schema_version !== 1) return null
  const method = nonEmptyString(value.method)
  const commandId = nonEmptyString(value.command_id)
  const operationId = optionalNonEmptyString(value.operation_id)
  const fingerprint = targetFingerprint(value.target_fingerprint)
  const terminalStage = value.terminal_stage
  const reasonCode = nonEmptyString(value.reason_code)
  const retrySafety = value.retry_safety
  if (
    !method
    || !commandId
    || operationId === null
    || fingerprint === null
    || typeof terminalStage !== "string"
    || !TERMINAL_STAGES.has(terminalStage as YeonjangCommandAttemptTerminalStage)
    || !reasonCode
    || typeof retrySafety !== "string"
    || !RETRY_SAFETY_VALUES.has(retrySafety as YeonjangCommandAttemptRetrySafety)
  ) {
    return null
  }
  return {
    schemaVersion: 1,
    method,
    commandId,
    ...(operationId ? { operationId } : {}),
    ...(fingerprint ? { targetFingerprint: fingerprint } : {}),
    terminalStage: terminalStage as YeonjangCommandAttemptTerminalStage,
    reasonCode,
    retrySafety: retrySafety as YeonjangCommandAttemptRetrySafety,
  }
}

export type YeonjangResponseFailureInput =
  | {
      readonly kind: "response_timeout"
      readonly method: string
      readonly commandId: string
      readonly lastObservedStage?: "received" | "handler_started" | "helper_started"
    }
  | {
      readonly kind: "cancelled"
      readonly method: string
      readonly commandId: string
    }
  | {
      readonly kind: "response_error"
      readonly method: string
      readonly commandId: string
      readonly error: { readonly code?: string; readonly message?: string }
      readonly attempt?: unknown
    }

export interface YeonjangResponseFailureProjection {
  readonly code: string
  readonly message: string
  readonly attempt?: YeonjangCommandAttemptEvidence
}

export function projectYeonjangResponseFailure(
  input: YeonjangResponseFailureInput,
): YeonjangResponseFailureProjection {
  if (input.kind === "response_timeout") {
    const handlerStarted =
      input.lastObservedStage === "handler_started"
      || input.lastObservedStage === "helper_started"
    const code =
      input.method === "camera.capture"
        ? handlerStarted
          ? "camera_handler_timeout"
          : "camera_response_timeout"
        : "yeonjang_response_timeout"
    return {
      code,
      message: "Yeonjang command response timed out.",
      attempt: {
        schemaVersion: 1,
        method: input.method,
        commandId: input.commandId,
        terminalStage: handlerStarted ? "handler_timeout" : "response_timeout",
        reasonCode: code,
        retrySafety: "unknown_effect_state",
      },
    }
  }
  if (input.kind === "cancelled") {
    const code =
      input.method === "camera.capture"
        ? "camera_capture_cancelled"
        : "yeonjang_command_cancelled"
    return {
      code,
      message: "Yeonjang command was cancelled before its effect state was confirmed.",
      attempt: {
        schemaVersion: 1,
        method: input.method,
        commandId: input.commandId,
        terminalStage: "cancelled",
        reasonCode: code,
        retrySafety: "unknown_effect_state",
      },
    }
  }

  const parsedAttempt = parseYeonjangCommandAttemptEvidence(input.attempt)
  const boundAttempt =
    parsedAttempt
    && parsedAttempt.commandId === input.commandId
    && parsedAttempt.method === input.method
      ? parsedAttempt
      : null
  return {
    code: nonEmptyString(input.error.code) ?? "yeonjang_request_failed",
    message: nonEmptyString(input.error.message) ?? "Yeonjang request failed.",
    ...(boundAttempt ? { attempt: boundAttempt } : {}),
  }
}

export type { YeonjangCommandAttemptWireV1 }
