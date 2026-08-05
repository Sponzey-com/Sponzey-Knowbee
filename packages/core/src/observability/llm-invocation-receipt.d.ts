export declare const LLM_INVOCATION_RECEIPT_SCHEMA_VERSION: 1;
export type LlmInvocationStage = "intake" | "planning" | "execution" | "review" | "final_response" | "maintenance" | "other";
export type LlmInvocationPhase = "started" | "completed" | "failed" | "cancelled";
export type LlmInvocationTerminalReasonCode = "provider_error" | "provider_contract_rejected" | "provider_unavailable" | "transport_failed" | "aborted" | "consumer_closed";
export interface LlmInvocationContext {
    runId?: string | undefined;
    requestGroupId?: string | undefined;
    sessionId?: string | undefined;
    stage: LlmInvocationStage;
    operationCode: string;
}
export interface LlmInvocationReceipt {
    schemaVersion: typeof LLM_INVOCATION_RECEIPT_SCHEMA_VERSION;
    invocationId: string;
    phase: LlmInvocationPhase;
    at: number;
    context: Readonly<LlmInvocationContext>;
    durationMs?: number | undefined;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    reasonCode?: LlmInvocationTerminalReasonCode | undefined;
}
export type LlmInvocationReceiptRejectionReason = "schema_version_unsupported" | "invocation_id_required" | "timestamp_invalid" | "correlation_required" | "stage_invalid" | "operation_code_invalid" | "terminal_duration_required" | "started_terminal_field_forbidden" | "token_count_invalid" | "terminal_reason_invalid";
export type BuildLlmInvocationReceiptResult = {
    status: "ready";
    receipt: LlmInvocationReceipt;
} | {
    status: "rejected";
    reasonCode: LlmInvocationReceiptRejectionReason;
};
export declare function buildLlmInvocationReceipt(input: LlmInvocationReceipt): BuildLlmInvocationReceiptResult;
//# sourceMappingURL=llm-invocation-receipt.d.ts.map