const TERMINAL_STAGES = new Set([
    "rejected",
    "handler_failed",
    "helper_timeout",
    "handler_timeout",
    "cancelled",
    "response_ready",
    "response_timeout",
]);
const RETRY_SAFETY_VALUES = new Set([
    "safe_same_command",
    "change_strategy",
    "unknown_effect_state",
    "completed",
]);
function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function nonEmptyString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
function optionalNonEmptyString(value) {
    if (value === undefined)
        return undefined;
    return nonEmptyString(value);
}
function targetFingerprint(value) {
    if (value === undefined)
        return undefined;
    const normalized = nonEmptyString(value);
    if (!normalized || !/^sha256:[a-f0-9]{64}$/.test(normalized))
        return null;
    return normalized;
}
export function parseYeonjangCommandAttemptEvidence(value) {
    if (!isRecord(value) || value.schema_version !== 1)
        return null;
    const method = nonEmptyString(value.method);
    const commandId = nonEmptyString(value.command_id);
    const operationId = optionalNonEmptyString(value.operation_id);
    const fingerprint = targetFingerprint(value.target_fingerprint);
    const terminalStage = value.terminal_stage;
    const reasonCode = nonEmptyString(value.reason_code);
    const retrySafety = value.retry_safety;
    if (!method
        || !commandId
        || operationId === null
        || fingerprint === null
        || typeof terminalStage !== "string"
        || !TERMINAL_STAGES.has(terminalStage)
        || !reasonCode
        || typeof retrySafety !== "string"
        || !RETRY_SAFETY_VALUES.has(retrySafety)) {
        return null;
    }
    return {
        schemaVersion: 1,
        method,
        commandId,
        ...(operationId ? { operationId } : {}),
        ...(fingerprint ? { targetFingerprint: fingerprint } : {}),
        terminalStage: terminalStage,
        reasonCode,
        retrySafety: retrySafety,
    };
}
export function projectYeonjangResponseFailure(input) {
    if (input.kind === "response_timeout") {
        const handlerStarted = input.lastObservedStage === "handler_started"
            || input.lastObservedStage === "helper_started";
        const code = input.method === "camera.capture"
            ? handlerStarted
                ? "camera_handler_timeout"
                : "camera_response_timeout"
            : "yeonjang_response_timeout";
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
        };
    }
    if (input.kind === "cancelled") {
        const code = input.method === "camera.capture"
            ? "camera_capture_cancelled"
            : "yeonjang_command_cancelled";
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
        };
    }
    const parsedAttempt = parseYeonjangCommandAttemptEvidence(input.attempt);
    const boundAttempt = parsedAttempt
        && parsedAttempt.commandId === input.commandId
        && parsedAttempt.method === input.method
        ? parsedAttempt
        : null;
    return {
        code: nonEmptyString(input.error.code) ?? "yeonjang_request_failed",
        message: nonEmptyString(input.error.message) ?? "Yeonjang request failed.",
        ...(boundAttempt ? { attempt: boundAttempt } : {}),
    };
}
//# sourceMappingURL=command-attempt.js.map