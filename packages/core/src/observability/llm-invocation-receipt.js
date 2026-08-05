export const LLM_INVOCATION_RECEIPT_SCHEMA_VERSION = 1;
const OPERATION_CODE = /^[a-z][a-z0-9_]{1,63}$/u;
const INVOCATION_STAGES = new Set([
    "intake",
    "planning",
    "execution",
    "review",
    "final_response",
    "maintenance",
    "other",
]);
const TERMINAL_PHASES = new Set(["completed", "failed", "cancelled"]);
const MAX_TOKEN_COUNT = 1_000_000_000;
function nonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function validTokenCount(value) {
    return (value === undefined || (Number.isSafeInteger(value) && value >= 0 && value <= MAX_TOKEN_COUNT));
}
export function buildLlmInvocationReceipt(input) {
    if (input.schemaVersion !== LLM_INVOCATION_RECEIPT_SCHEMA_VERSION) {
        return { status: "rejected", reasonCode: "schema_version_unsupported" };
    }
    if (!nonEmpty(input.invocationId)) {
        return { status: "rejected", reasonCode: "invocation_id_required" };
    }
    if (!Number.isSafeInteger(input.at) || input.at < 0) {
        return { status: "rejected", reasonCode: "timestamp_invalid" };
    }
    if (!nonEmpty(input.context.runId) && !nonEmpty(input.context.requestGroupId)) {
        return { status: "rejected", reasonCode: "correlation_required" };
    }
    if (!INVOCATION_STAGES.has(input.context.stage)) {
        return { status: "rejected", reasonCode: "stage_invalid" };
    }
    if (!OPERATION_CODE.test(input.context.operationCode)) {
        return { status: "rejected", reasonCode: "operation_code_invalid" };
    }
    const terminal = TERMINAL_PHASES.has(input.phase);
    if (terminal && (!Number.isSafeInteger(input.durationMs) || (input.durationMs ?? -1) < 0)) {
        return { status: "rejected", reasonCode: "terminal_duration_required" };
    }
    if (input.phase === "started" &&
        (input.durationMs !== undefined ||
            input.inputTokens !== undefined ||
            input.outputTokens !== undefined ||
            input.reasonCode !== undefined)) {
        return { status: "rejected", reasonCode: "started_terminal_field_forbidden" };
    }
    if (!validTokenCount(input.inputTokens) || !validTokenCount(input.outputTokens)) {
        return { status: "rejected", reasonCode: "token_count_invalid" };
    }
    if (input.phase === "completed" && input.reasonCode !== undefined) {
        return { status: "rejected", reasonCode: "terminal_reason_invalid" };
    }
    if ((input.phase === "failed" || input.phase === "cancelled") && !input.reasonCode) {
        return { status: "rejected", reasonCode: "terminal_reason_invalid" };
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
    };
}
//# sourceMappingURL=llm-invocation-receipt.js.map