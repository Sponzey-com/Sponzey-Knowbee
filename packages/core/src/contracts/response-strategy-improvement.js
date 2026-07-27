export const RESPONSE_FEEDBACK_KINDS = [
    "user_reaction",
    "repeated_request",
    "failure_pattern",
    "explanation_request",
    "satisfaction",
    "dissatisfaction",
];
export const RESPONSE_STRATEGY_TARGETS = [
    "request_analysis",
    "clarification",
    "solution_path",
    "failure_report",
    "next_action",
    "delegation_decision",
];
export const RESPONSE_STRATEGY_PROTECTED_INVARIANTS = [
    "user_name",
    "agent_name",
    "memory_isolation",
    "permission",
    "safety",
    "response_language",
];
function exact(value) {
    return value.trim();
}
export function verifyResponseFeedbackEvidence(receipts) {
    if (receipts.length < 2)
        return { status: "blocked", reasonCode: "feedback_evidence_insufficient" };
    const refs = new Set();
    const kinds = new Set();
    let credible = 0;
    for (const receipt of receipts) {
        if (!RESPONSE_FEEDBACK_KINDS.includes(receipt.kind)
            || !exact(receipt.sessionId) || !exact(receipt.runId)
            || !exact(receipt.observedBehavior) || !exact(receipt.evidenceRef)
            || refs.has(receipt.evidenceRef)
            || receipt.diagnosedBy !== "llm"
            || !Number.isSafeInteger(receipt.observedAt) || receipt.observedAt < 0) {
            return { status: "blocked", reasonCode: "feedback_evidence_invalid" };
        }
        refs.add(receipt.evidenceRef);
        kinds.add(receipt.kind);
        if (receipt.confidence === "medium" || receipt.confidence === "high")
            credible += 1;
    }
    if (credible === 0)
        return { status: "blocked", reasonCode: "feedback_evidence_ambiguous" };
    return { status: "verified", evidenceRefs: [...refs], feedbackKinds: [...kinds] };
}
export function authorizeResponseStrategyImprovement(input) {
    if (input.feedback.status !== "verified")
        return { status: "blocked", reasonCode: "feedback_not_verified" };
    if (!RESPONSE_STRATEGY_TARGETS.includes(input.proposalTarget) || !RESPONSE_STRATEGY_TARGETS.includes(input.writerTarget)) {
        return { status: "blocked", reasonCode: "strategy_target_invalid" };
    }
    if (input.proposalTarget !== input.writerTarget)
        return { status: "blocked", reasonCode: "strategy_target_mismatch" };
    const invariants = new Map();
    for (const receipt of input.invariants) {
        if (!RESPONSE_STRATEGY_PROTECTED_INVARIANTS.includes(receipt.invariant)
            || invariants.has(receipt.invariant) || !exact(receipt.evidenceRef)) {
            return { status: "blocked", reasonCode: "protected_invariant_missing", invariant: receipt.invariant };
        }
        invariants.set(receipt.invariant, receipt);
    }
    for (const invariant of RESPONSE_STRATEGY_PROTECTED_INVARIANTS) {
        const receipt = invariants.get(invariant);
        if (!receipt)
            return { status: "blocked", reasonCode: "protected_invariant_missing", invariant };
        if (receipt.before !== "preserved" || receipt.after !== "preserved") {
            return { status: "blocked", reasonCode: "protected_invariant_weakened", invariant };
        }
        if (!receipt.regressionPassed) {
            return { status: "blocked", reasonCode: "protected_invariant_regression_failed", invariant };
        }
    }
    return {
        status: "authorized",
        target: input.proposalTarget,
        evidenceRefs: input.feedback.evidenceRefs,
        protectedInvariants: RESPONSE_STRATEGY_PROTECTED_INVARIANTS,
    };
}
export async function applyAuthorizedResponseStrategyImprovement(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "applied", result: await input.apply(input.decision) };
}
//# sourceMappingURL=response-strategy-improvement.js.map