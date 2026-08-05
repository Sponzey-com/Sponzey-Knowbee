export const TERMINAL_RUN_STATUSES = ["completed", "failed", "cancelled", "interrupted"];
const terminalRunStatusSet = new Set(TERMINAL_RUN_STATUSES);
export function isTerminalRunStatus(status) {
    return terminalRunStatusSet.has(status);
}
export function canTransitionRunStatus(currentStatus, nextStatus) {
    if (currentStatus === nextStatus)
        return { allowed: true };
    if (isTerminalRunStatus(currentStatus)) {
        return {
            allowed: false,
            reason: `terminal_status_locked:${currentStatus}->${nextStatus}`,
        };
    }
    return { allowed: true };
}
export function resolveRunFlowIdentifiers(params) {
    const requestGroupId = params.requestGroupId?.trim() || params.runId;
    const lineageRootRunId = params.lineageRootRunId?.trim() || requestGroupId;
    const runScope = params.runScope ?? (params.parentRunId ? "child" : "root");
    return {
        runId: params.runId,
        sessionId: params.sessionId,
        requestGroupId,
        lineageRootRunId,
        runScope,
        ...(params.parentRunId?.trim() ? { parentRunId: params.parentRunId.trim() } : {}),
        ...(params.scheduleId?.trim() ? { scheduleId: params.scheduleId.trim() } : {}),
    };
}
function effectiveCanonicalOutcomeState(aggregate) {
    if (aggregate.state !== "USER_REPORT")
        return aggregate.state;
    const reportTransition = aggregate.transitions[aggregate.transitions.length - 1];
    if (reportTransition?.event !== "REPORT_DELIVERED")
        return undefined;
    return reportTransition.previousState;
}
function executionStatusForCanonicalState(state, runStatus) {
    if (!state)
        return "internal_fault";
    switch (state) {
        case "USER_INPUT_REQUIRED":
            return runStatus === "awaiting_approval" ? "awaiting_approval" : "awaiting_user";
        case "SUCCEEDED":
            return "succeeded";
        case "PARTIALLY_SUCCEEDED":
            return "partially_succeeded";
        case "BLOCKED":
            return "blocked";
        case "EXHAUSTED":
            return "exhausted";
        case "CANCELLED":
            return "cancelled";
        case "USER_REPORT":
            return "internal_fault";
        default:
            return runStatus === "failed" || runStatus === "cancelled" || runStatus === "interrupted"
                ? "internal_fault"
                : "in_progress";
    }
}
export function projectRequestExecutionOutcome(input) {
    return {
        executionStatus: executionStatusForCanonicalState(effectiveCanonicalOutcomeState(input.aggregate), input.runStatus),
        deliveryStatus: input.deliveryStatus,
    };
}
//# sourceMappingURL=flow-contract.js.map