export declare const CANONICAL_WORK_STATES: readonly ["REQUEST_RECEIVED", "SOLUTION_ANALYZED", "POLICY_VALIDATED", "EXECUTING", "AWAITING_APPROVAL", "RESULT_REVIEW", "SUCCEEDED", "PARTIALLY_SUCCEEDED", "USER_INPUT_REQUIRED", "BLOCKED", "EXHAUSTED", "CANCELLED", "USER_REPORT"];
export type CanonicalWorkState = typeof CANONICAL_WORK_STATES[number];
export declare const CANONICAL_WORK_EVENTS: readonly ["DIAGNOSIS_ACCEPTED", "ANALYSIS_REVISED", "POLICY_ALLOWED", "EXECUTION_STARTED", "APPROVAL_REQUESTED", "APPROVAL_CONSUMED", "APPROVAL_DENIED_OR_EXPIRED", "ATTEMPT_RECORDED", "ALL_CRITERIA_VERIFIED", "SOME_CRITERIA_VERIFIED", "RECOVERY_ACCEPTED", "INPUT_REQUIRED", "USER_INPUT_RECEIVED", "POLICY_BLOCKED", "RESULT_BLOCKED", "PATHS_EXHAUSTED", "USER_CANCELLED", "REPORT_DELIVERED"];
export type CanonicalWorkEvent = typeof CANONICAL_WORK_EVENTS[number];
export interface CanonicalWorkTransitionCommand {
    currentState: CanonicalWorkState;
    event: CanonicalWorkEvent;
    receiptRef: string;
}
export type CanonicalWorkTransitionDecision = {
    accepted: true;
    previousState: CanonicalWorkState;
    event: CanonicalWorkEvent;
    nextState: CanonicalWorkState;
    receiptRef: string;
} | {
    accepted: false;
    currentState: CanonicalWorkState;
    event: CanonicalWorkEvent;
    reasonCode: "receipt_required" | "transition_not_allowed" | "terminal_state_locked";
};
type StateTransitions = Readonly<Partial<Record<CanonicalWorkEvent, CanonicalWorkState>>>;
export declare const CANONICAL_WORK_TRANSITIONS: Readonly<Record<CanonicalWorkState, StateTransitions>>;
export declare function transitionCanonicalWorkState(command: CanonicalWorkTransitionCommand): CanonicalWorkTransitionDecision;
export {};
//# sourceMappingURL=canonical-work-state.d.ts.map