export const CANONICAL_WORK_STATES = [
    "REQUEST_RECEIVED",
    "SOLUTION_ANALYZED",
    "POLICY_VALIDATED",
    "EXECUTING",
    "RESULT_REVIEW",
    "SUCCEEDED",
    "PARTIALLY_SUCCEEDED",
    "USER_INPUT_REQUIRED",
    "BLOCKED",
    "EXHAUSTED",
    "CANCELLED",
    "USER_REPORT",
];
export const CANONICAL_WORK_EVENTS = [
    "DIAGNOSIS_ACCEPTED",
    "ANALYSIS_REVISED",
    "POLICY_ALLOWED",
    "EXECUTION_STARTED",
    "ATTEMPT_RECORDED",
    "ALL_CRITERIA_VERIFIED",
    "SOME_CRITERIA_VERIFIED",
    "RECOVERY_ACCEPTED",
    "INPUT_REQUIRED",
    "USER_INPUT_RECEIVED",
    "POLICY_BLOCKED",
    "RESULT_BLOCKED",
    "PATHS_EXHAUSTED",
    "USER_CANCELLED",
    "REPORT_DELIVERED",
];
export const CANONICAL_WORK_TRANSITIONS = Object.freeze({
    REQUEST_RECEIVED: Object.freeze({
        DIAGNOSIS_ACCEPTED: "SOLUTION_ANALYZED",
        INPUT_REQUIRED: "USER_INPUT_REQUIRED",
        USER_CANCELLED: "CANCELLED",
    }),
    SOLUTION_ANALYZED: Object.freeze({
        ANALYSIS_REVISED: "SOLUTION_ANALYZED",
        POLICY_ALLOWED: "POLICY_VALIDATED",
        INPUT_REQUIRED: "USER_INPUT_REQUIRED",
        POLICY_BLOCKED: "BLOCKED",
        USER_CANCELLED: "CANCELLED",
    }),
    POLICY_VALIDATED: Object.freeze({
        EXECUTION_STARTED: "EXECUTING",
        INPUT_REQUIRED: "USER_INPUT_REQUIRED",
        POLICY_BLOCKED: "BLOCKED",
        USER_CANCELLED: "CANCELLED",
    }),
    EXECUTING: Object.freeze({
        ATTEMPT_RECORDED: "RESULT_REVIEW",
        INPUT_REQUIRED: "USER_INPUT_REQUIRED",
        POLICY_BLOCKED: "BLOCKED",
        USER_CANCELLED: "CANCELLED",
    }),
    RESULT_REVIEW: Object.freeze({
        ALL_CRITERIA_VERIFIED: "SUCCEEDED",
        SOME_CRITERIA_VERIFIED: "PARTIALLY_SUCCEEDED",
        RECOVERY_ACCEPTED: "SOLUTION_ANALYZED",
        INPUT_REQUIRED: "USER_INPUT_REQUIRED",
        POLICY_BLOCKED: "BLOCKED",
        RESULT_BLOCKED: "BLOCKED",
        PATHS_EXHAUSTED: "EXHAUSTED",
        USER_CANCELLED: "CANCELLED",
    }),
    SUCCEEDED: Object.freeze({ REPORT_DELIVERED: "USER_REPORT" }),
    PARTIALLY_SUCCEEDED: Object.freeze({
        RECOVERY_ACCEPTED: "SOLUTION_ANALYZED",
        REPORT_DELIVERED: "USER_REPORT",
        USER_CANCELLED: "CANCELLED",
    }),
    USER_INPUT_REQUIRED: Object.freeze({
        USER_INPUT_RECEIVED: "SOLUTION_ANALYZED",
        USER_CANCELLED: "CANCELLED",
    }),
    BLOCKED: Object.freeze({ REPORT_DELIVERED: "USER_REPORT" }),
    EXHAUSTED: Object.freeze({ REPORT_DELIVERED: "USER_REPORT" }),
    CANCELLED: Object.freeze({ REPORT_DELIVERED: "USER_REPORT" }),
    USER_REPORT: Object.freeze({}),
});
export function transitionCanonicalWorkState(command) {
    const receiptRef = command.receiptRef.trim();
    if (!receiptRef) {
        return {
            accepted: false,
            currentState: command.currentState,
            event: command.event,
            reasonCode: "receipt_required",
        };
    }
    if (command.currentState === "USER_REPORT") {
        return {
            accepted: false,
            currentState: command.currentState,
            event: command.event,
            reasonCode: "terminal_state_locked",
        };
    }
    const nextState = CANONICAL_WORK_TRANSITIONS[command.currentState][command.event];
    if (!nextState) {
        return {
            accepted: false,
            currentState: command.currentState,
            event: command.event,
            reasonCode: "transition_not_allowed",
        };
    }
    return {
        accepted: true,
        previousState: command.currentState,
        event: command.event,
        nextState,
        receiptRef,
    };
}
//# sourceMappingURL=canonical-work-state.js.map