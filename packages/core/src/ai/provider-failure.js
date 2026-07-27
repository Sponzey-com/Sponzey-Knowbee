const PROVIDER_FAILURE_REASON_CODES = [
    "provider_contract_rejected",
    "provider_unavailable",
    "transport_failed",
];
export class AIProviderInvocationError extends Error {
    kind = "knowbee.ai_provider_invocation_error.v1";
    reasonCode;
    constructor(reasonCode) {
        super("AI provider invocation failed.");
        this.name = "AIProviderInvocationError";
        this.reasonCode = reasonCode;
    }
}
export function isAIProviderInvocationError(failure) {
    if (!failure || typeof failure !== "object")
        return false;
    const candidate = failure;
    return (candidate.kind === "knowbee.ai_provider_invocation_error.v1"
        && typeof candidate.reasonCode === "string"
        && PROVIDER_FAILURE_REASON_CODES.includes(candidate.reasonCode));
}
export function providerFailureReasonCode(failure) {
    return isAIProviderInvocationError(failure)
        ? failure.reasonCode
        : "provider_unavailable";
}
export function providerFailureReasonForHttpStatus(status) {
    if (status === 400 || status === 404 || status === 405 || status === 409 || status === 422) {
        return "provider_contract_rejected";
    }
    return "provider_unavailable";
}
//# sourceMappingURL=provider-failure.js.map