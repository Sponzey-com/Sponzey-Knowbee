export type AIProviderFailureReasonCode = "provider_contract_rejected" | "provider_unavailable" | "transport_failed";
export declare class AIProviderInvocationError extends Error {
    readonly kind = "knowbee.ai_provider_invocation_error.v1";
    readonly reasonCode: AIProviderFailureReasonCode;
    constructor(reasonCode: AIProviderFailureReasonCode);
}
export declare function isAIProviderInvocationError(failure: unknown): failure is AIProviderInvocationError;
export declare function providerFailureReasonCode(failure: unknown): AIProviderFailureReasonCode;
export declare function providerFailureReasonForHttpStatus(status: number): AIProviderFailureReasonCode;
//# sourceMappingURL=provider-failure.d.ts.map