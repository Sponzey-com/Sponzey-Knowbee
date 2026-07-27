export const CANONICAL_RECURSIVE_IMPROVEMENT_STATES = [
    "idle", "intake", "source_discovery", "baseline_capture", "proposal_drafting",
    "harness_meta_review", "invariant_review", "diff_generation", "approval_wait",
    "apply_change", "test_execution", "activation_pending", "activated", "reporting",
    "completed", "blocked", "rolled_back",
];
export const CANONICAL_RECURSIVE_IMPROVEMENT_EVENTS = [
    "start_requested", "inputs_validated", "source_found", "source_missing", "baseline_recorded",
    "proposal_ready", "harness_change_requested", "harness_guardrails_passed", "harness_guardrails_failed",
    "invariant_passed", "invariant_failed", "diff_ready", "approval_granted", "approval_denied",
    "change_applied", "tests_passed", "tests_failed", "activation_confirmed", "rollback_requested",
    "rollback_completed", "max_retry_reached", "cancel_requested",
];
export const CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS = [
    { from: "idle", event: "start_requested", to: "intake" },
    { from: "intake", event: "inputs_validated", to: "source_discovery" },
    { from: "intake", event: "cancel_requested", to: "blocked" },
    { from: "source_discovery", event: "source_found", to: "baseline_capture" },
    { from: "source_discovery", event: "source_missing", to: "blocked" },
    { from: "baseline_capture", event: "baseline_recorded", to: "proposal_drafting" },
    { from: "proposal_drafting", event: "proposal_ready", to: "invariant_review" },
    { from: "proposal_drafting", event: "harness_change_requested", to: "harness_meta_review" },
    { from: "harness_meta_review", event: "harness_guardrails_passed", to: "invariant_review" },
    { from: "harness_meta_review", event: "harness_guardrails_failed", to: "blocked" },
    { from: "invariant_review", event: "invariant_passed", to: "diff_generation" },
    { from: "invariant_review", event: "invariant_failed", to: "blocked" },
    { from: "diff_generation", event: "diff_ready", to: "approval_wait" },
    { from: "approval_wait", event: "approval_granted", to: "apply_change" },
    { from: "approval_wait", event: "approval_denied", to: "blocked" },
    { from: "apply_change", event: "change_applied", to: "test_execution" },
    { from: "test_execution", event: "tests_passed", to: "activation_pending" },
    { from: "test_execution", event: "tests_failed", to: "proposal_drafting" },
    { from: "apply_change", event: "rollback_completed", to: "rolled_back" },
    { from: "test_execution", event: "rollback_completed", to: "rolled_back" },
    { from: "activation_pending", event: "rollback_completed", to: "rolled_back" },
    { from: "activated", event: "rollback_completed", to: "rolled_back" },
    { from: "activation_pending", event: "activation_confirmed", to: "activated" },
    { from: "activated", event: null, to: "reporting" },
    { from: "reporting", event: null, to: "completed" },
];
const TERMINAL_STATES = new Set(["completed", "blocked", "rolled_back"]);
const ROLLBACK_CAPABLE_STATES = new Set(["apply_change", "test_execution", "activation_pending", "activated"]);
function exactSet(left, right) {
    const a = left.map((value) => value.trim()).filter(Boolean);
    const b = right.map((value) => value.trim()).filter(Boolean);
    return a.length === left.length && b.length === right.length && a.length > 0
        && new Set(a).size === a.length && new Set(b).size === b.length
        && a.length === b.length && a.every((value) => b.includes(value));
}
function exactScope(value, proposal, sourceSet) {
    return value.proposalFingerprint === proposal && value.sourceSetFingerprint === sourceSet;
}
function authorized(input, terminalFacts) {
    const terminal = TERMINAL_STATES.has(input.requestedNextState);
    return { status: "authorized", previousState: input.currentState, event: input.event, nextState: input.requestedNextState, terminal, ...(terminalFacts ? { terminalFacts } : {}) };
}
function authorizeBlocked(input, proposal, sourceSet) {
    if (input.sourceWrite.state === "written")
        return { status: "blocked", reasonCode: "transition_not_allowed" };
    const evidence = input.blockedEvidence;
    if (!evidence)
        return { status: "blocked", reasonCode: "blocked_evidence_missing" };
    if (!exactScope(evidence, proposal, sourceSet) || !evidence.evidenceRef.trim())
        return { status: "blocked", reasonCode: "blocked_evidence_scope_mismatch" };
    return authorized(input, { reason: evidence.reason, evidenceRef: evidence.evidenceRef });
}
export function authorizeRecursiveImprovementTransition(input) {
    const proposal = input.proposalFingerprint.trim();
    const sourceSet = input.sourceSetFingerprint.trim();
    if (!CANONICAL_RECURSIVE_IMPROVEMENT_STATES.includes(input.currentState)
        || !CANONICAL_RECURSIVE_IMPROVEMENT_STATES.includes(input.requestedNextState) || !proposal || !sourceSet) {
        return { status: "blocked", reasonCode: "state_invalid" };
    }
    if (input.event !== null && !CANONICAL_RECURSIVE_IMPROVEMENT_EVENTS.includes(input.event))
        return { status: "blocked", reasonCode: "event_invalid" };
    if (TERMINAL_STATES.has(input.currentState))
        return { status: "blocked", reasonCode: "terminal_state_exit_forbidden" };
    const sourceRefs = input.sourceWrite.sourceRefs;
    if (sourceRefs.length === 0 || new Set(sourceRefs.map((value) => value.trim())).size !== sourceRefs.length || sourceRefs.some((value) => !value.trim())) {
        return { status: "blocked", reasonCode: "source_write_evidence_invalid" };
    }
    if (input.event === "rollback_requested") {
        if (input.sourceWrite.state !== "written")
            return { status: "blocked", reasonCode: "rollback_source_not_written" };
        if (!ROLLBACK_CAPABLE_STATES.has(input.currentState))
            return { status: "blocked", reasonCode: "transition_not_allowed" };
        return { status: "rollback_required", reasonCode: "rollback_requested", sourceRefs };
    }
    if (input.event === "cancel_requested") {
        if (input.sourceWrite.state === "written")
            return ROLLBACK_CAPABLE_STATES.has(input.currentState)
                ? { status: "rollback_required", reasonCode: "cancel_after_write", sourceRefs }
                : { status: "blocked", reasonCode: "transition_not_allowed" };
        if (input.requestedNextState !== "blocked")
            return { status: "blocked", reasonCode: "transition_not_allowed" };
        return authorizeBlocked(input, proposal, sourceSet);
    }
    if (input.event === "max_retry_reached") {
        if (!input.blockedEvidence)
            return { status: "blocked", reasonCode: "blocked_evidence_missing" };
        if (!exactScope(input.blockedEvidence, proposal, sourceSet) || !input.blockedEvidence.evidenceRef.trim())
            return { status: "blocked", reasonCode: "blocked_evidence_scope_mismatch" };
        return input.sourceWrite.state === "written"
            ? { status: "rollback_required", reasonCode: "terminal_stop_after_write", sourceRefs }
            : input.requestedNextState === "blocked" ? authorized(input, { reason: input.blockedEvidence.reason, evidenceRef: input.blockedEvidence.evidenceRef })
                : { status: "blocked", reasonCode: "transition_not_allowed" };
    }
    const rule = CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS.find((item) => item.from === input.currentState && item.event === input.event && item.to === input.requestedNextState);
    if (!rule)
        return { status: "blocked", reasonCode: "transition_not_allowed" };
    if (input.requestedNextState === "blocked")
        return authorizeBlocked(input, proposal, sourceSet);
    if (input.event === "tests_failed") {
        const retry = input.retryEvidence;
        if (!retry)
            return { status: "blocked", reasonCode: "retry_evidence_missing" };
        if (!exactScope(retry, proposal, sourceSet) || !retry.evidenceRef.trim() || retry.changedAxes.length === 0 || new Set(retry.changedAxes).size !== retry.changedAxes.length) {
            return { status: "blocked", reasonCode: "retry_evidence_invalid" };
        }
    }
    if (input.requestedNextState === "rolled_back") {
        const rollback = input.rollbackEvidence;
        if (input.sourceWrite.state !== "written" || !rollback || !exactScope(rollback, proposal, sourceSet)
            || !rollback.baselineRestored || !rollback.verificationRef.trim() || !exactSet(rollback.restoredSourceRefs, sourceRefs)) {
            return { status: "blocked", reasonCode: "rollback_evidence_invalid" };
        }
        return authorized(input, { baselineRestored: true, restoredSourceRefs: rollback.restoredSourceRefs, verificationRef: rollback.verificationRef });
    }
    if (input.requestedNextState === "completed") {
        const completion = input.completionEvidence;
        if (!completion)
            return { status: "blocked", reasonCode: "completion_evidence_missing" };
        if (input.sourceWrite.state !== "written" || !exactScope(completion, proposal, sourceSet) || !completion.sourceWriteVerified
            || !exactSet(completion.changedSourceRefs, sourceRefs) || completion.validationEvidenceRefs.length === 0
            || completion.validationEvidenceRefs.some((value) => !value.trim()) || !completion.activationEvidenceRef.trim()
            || !completion.rollbackPath.trim() || !completion.finalReportRef.trim())
            return { status: "blocked", reasonCode: "completion_evidence_invalid" };
        return authorized(input, { changedSourceRefs: completion.changedSourceRefs, activationState: completion.activationState,
            rollbackPath: completion.rollbackPath, finalReportRef: completion.finalReportRef });
    }
    return authorized(input);
}
//# sourceMappingURL=recursive-improvement-state-machine.js.map