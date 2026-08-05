export type AIProviderFailureReasonCode =
  | "provider_contract_rejected"
  | "provider_unavailable"
  | "transport_failed"

const PROVIDER_FAILURE_REASON_CODES: readonly string[] = [
  "provider_contract_rejected",
  "provider_unavailable",
  "transport_failed",
]

export class AIProviderInvocationError extends Error {
  readonly kind = "knowbee.ai_provider_invocation_error.v1"
  readonly reasonCode: AIProviderFailureReasonCode

  constructor(reasonCode: AIProviderFailureReasonCode) {
    super("AI provider invocation failed.")
    this.name = "AIProviderInvocationError"
    this.reasonCode = reasonCode
  }
}

export function isAIProviderInvocationError(
  failure: unknown,
): failure is AIProviderInvocationError {
  if (!failure || typeof failure !== "object") return false
  const candidate = failure as Partial<AIProviderInvocationError>
  return (
    candidate.kind === "knowbee.ai_provider_invocation_error.v1"
    && typeof candidate.reasonCode === "string"
    && PROVIDER_FAILURE_REASON_CODES.includes(candidate.reasonCode)
  )
}

export function providerFailureReasonCode(
  failure: unknown,
): AIProviderFailureReasonCode {
  return isAIProviderInvocationError(failure)
    ? failure.reasonCode
    : "provider_unavailable"
}

export function providerFailureReasonForHttpStatus(
  status: number,
): AIProviderFailureReasonCode {
  if (status === 400 || status === 404 || status === 405 || status === 409 || status === 422) {
    return "provider_contract_rejected"
  }
  return "provider_unavailable"
}
