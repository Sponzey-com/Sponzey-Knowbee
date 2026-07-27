export declare const CANONICAL_RECURSIVE_IMPROVEMENT_STATES: readonly ["idle", "intake", "source_discovery", "baseline_capture", "proposal_drafting", "harness_meta_review", "invariant_review", "diff_generation", "approval_wait", "apply_change", "test_execution", "activation_pending", "activated", "reporting", "completed", "blocked", "rolled_back"];
export declare const CANONICAL_RECURSIVE_IMPROVEMENT_EVENTS: readonly ["start_requested", "inputs_validated", "source_found", "source_missing", "baseline_recorded", "proposal_ready", "harness_change_requested", "harness_guardrails_passed", "harness_guardrails_failed", "invariant_passed", "invariant_failed", "diff_ready", "approval_granted", "approval_denied", "change_applied", "tests_passed", "tests_failed", "activation_confirmed", "rollback_requested", "rollback_completed", "max_retry_reached", "cancel_requested"];
export type RecursiveImprovementState = typeof CANONICAL_RECURSIVE_IMPROVEMENT_STATES[number];
export type RecursiveImprovementEvent = typeof CANONICAL_RECURSIVE_IMPROVEMENT_EVENTS[number];
export type RecursiveImprovementBlockedReason = "required_input_missing" | "source_missing" | "approval_missing" | "test_evidence_missing" | "invariant_evidence_missing" | "required_evidence_missing" | "user_limit_reached" | "safety_boundary_reached" | "safe_changed_strategies_exhausted" | "user_cancelled";
export interface RecursiveImprovementTransitionRule {
    from: RecursiveImprovementState;
    event: RecursiveImprovementEvent | null;
    to: RecursiveImprovementState;
}
export declare const CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS: readonly RecursiveImprovementTransitionRule[];
interface ScopedEvidence {
    proposalFingerprint: string;
    sourceSetFingerprint: string;
}
export interface RecursiveImprovementBlockedEvidence extends ScopedEvidence {
    reason: RecursiveImprovementBlockedReason;
    evidenceRef: string;
}
export interface RecursiveImprovementRetryEvidence extends ScopedEvidence {
    changedAxes: Array<"target" | "input" | "tool" | "work_split" | "execution_order" | "verification_method">;
    evidenceRef: string;
}
export interface RecursiveImprovementRollbackEvidence extends ScopedEvidence {
    restoredSourceRefs: string[];
    baselineRestored: boolean;
    verificationRef: string;
}
export interface RecursiveImprovementCompletionEvidence extends ScopedEvidence {
    changedSourceRefs: string[];
    sourceWriteVerified: boolean;
    validationEvidenceRefs: string[];
    activationState: "activated" | "activation_pending";
    activationEvidenceRef: string;
    rollbackPath: string;
    finalReportRef: string;
}
export interface RecursiveImprovementTransitionInput extends ScopedEvidence {
    currentState: RecursiveImprovementState;
    event: RecursiveImprovementEvent | null;
    requestedNextState: RecursiveImprovementState;
    sourceWrite: {
        state: "unchanged" | "written";
        sourceRefs: string[];
    };
    blockedEvidence?: RecursiveImprovementBlockedEvidence;
    retryEvidence?: RecursiveImprovementRetryEvidence;
    rollbackEvidence?: RecursiveImprovementRollbackEvidence;
    completionEvidence?: RecursiveImprovementCompletionEvidence;
}
export type RecursiveImprovementTransitionReasonCode = "state_invalid" | "event_invalid" | "terminal_state_exit_forbidden" | "transition_not_allowed" | "source_write_evidence_invalid" | "blocked_evidence_missing" | "blocked_evidence_scope_mismatch" | "retry_evidence_missing" | "retry_evidence_invalid" | "rollback_source_not_written" | "rollback_evidence_invalid" | "completion_evidence_missing" | "completion_evidence_invalid";
export type RecursiveImprovementTransitionDecision = {
    status: "authorized";
    previousState: RecursiveImprovementState;
    event: RecursiveImprovementEvent | null;
    nextState: RecursiveImprovementState;
    terminal: boolean;
    terminalFacts?: Record<string, string | boolean | string[]>;
} | {
    status: "rollback_required";
    reasonCode: "rollback_requested" | "cancel_after_write" | "terminal_stop_after_write";
    sourceRefs: string[];
} | {
    status: "blocked";
    reasonCode: RecursiveImprovementTransitionReasonCode;
};
export declare function authorizeRecursiveImprovementTransition(input: RecursiveImprovementTransitionInput): RecursiveImprovementTransitionDecision;
export {};
//# sourceMappingURL=recursive-improvement-state-machine.d.ts.map