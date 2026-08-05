const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u
const SAFE_MESSAGE_LIMIT = 240

export interface UiRequestFailureInput {
  status: number | null
  reasonCode: string
  safeMessage: string | null
}

export class UiRequestFailure extends Error {
  readonly status: number | null
  readonly reasonCode: string
  readonly safeMessage: string | null

  constructor(input: UiRequestFailureInput) {
    const reasonCode = normalizeReasonCode(input.reasonCode)
    super(reasonCode)
    this.name = "UiRequestFailure"
    this.status = normalizeStatus(input.status)
    this.reasonCode = reasonCode
    this.safeMessage = normalizeSafeMessage(input.safeMessage)
  }

  toJSON(): UiRequestFailureInput {
    return {
      status: this.status,
      reasonCode: this.reasonCode,
      safeMessage: this.safeMessage,
    }
  }
}

export function buildUiRequestFailure(input: {
  status: number
  statusText?: string
  bodyText?: string
}): UiRequestFailure {
  const parsed = parsePublicFailureBody(input.bodyText ?? "")
  return new UiRequestFailure({
    status: input.status,
    reasonCode: parsed.reasonCode,
    safeMessage: parsed.safeMessage,
  })
}

export function normalizeFetchFailure(cause: unknown): unknown {
  if (cause instanceof DOMException && cause.name === "AbortError") return cause
  return new UiRequestFailure({
    status: null,
    reasonCode: "network_unavailable",
    safeMessage: null,
  })
}

function parsePublicFailureBody(bodyText: string): {
  reasonCode: string
  safeMessage: string | null
} {
  if (!bodyText.trim()) return { reasonCode: "request_failed", safeMessage: null }
  try {
    const value: unknown = JSON.parse(bodyText)
    if (!isRecord(value)) return { reasonCode: "request_failed", safeMessage: null }
    return {
      reasonCode: normalizeReasonCode(value.reasonCode),
      safeMessage: normalizeSafeMessage(value.safeMessage),
    }
  } catch {
    return { reasonCode: "request_failed", safeMessage: null }
  }
}

function normalizeStatus(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599
    ? Number(value)
    : null
}

function normalizeReasonCode(value: unknown): string {
  return typeof value === "string" && REASON_CODE_PATTERN.test(value) ? value : "request_failed"
}

function normalizeSafeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > SAFE_MESSAGE_LIMIT ||
    containsControlCharacter(normalized)
  ) {
    return null
  }
  return normalized
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
