export const REQUIRED_DELEGATION_HANDOFF_FIELDS = [
    "task_goal",
    "context",
    "constraints",
    "expected_output",
    "validation_method",
    "retry_limit",
    "termination_condition",
];
export const REQUIRED_PARENT_DELEGATION_ACTIONS = [
    "review",
    "aggregate",
    "reject",
    "correct_and_redelegate",
];
function exact(value) {
    return value?.trim() ?? "";
}
function exactSet(expected, actual) {
    return actual.length === expected.length
        && new Set(actual).size === actual.length
        && actual.every((value) => expected.includes(value));
}
export function authorizePromptImprovementDelegationInvariant(input) {
    const snapshot = input.snapshot;
    if (snapshot.schemaVersion !== 1 || !exact(snapshot.evidenceRef)) {
        return { status: "blocked", reasonCode: "delegation_snapshot_invalid" };
    }
    if (snapshot.mainAgentDelegationScope !== "configured_top_level_direct_children_only") {
        return { status: "blocked", reasonCode: "main_delegation_scope_weakened" };
    }
    if (snapshot.subAgentDelegationScope !== "configured_direct_children_only") {
        return { status: "blocked", reasonCode: "sub_agent_delegation_scope_weakened" };
    }
    if (snapshot.runtimeChildCreationAllowed !== false) {
        return { status: "blocked", reasonCode: "runtime_child_creation_enabled" };
    }
    if (!exactSet(REQUIRED_DELEGATION_HANDOFF_FIELDS, snapshot.handoffRequiredFields)) {
        return { status: "blocked", reasonCode: "handoff_contract_incomplete" };
    }
    if (!exactSet(REQUIRED_PARENT_DELEGATION_ACTIONS, snapshot.parentActions)) {
        return { status: "blocked", reasonCode: "parent_review_capability_weakened" };
    }
    if (!snapshot.retryLimitRequired || !snapshot.insufficientResultMayBeCorrectedAndRedelegated) {
        return { status: "blocked", reasonCode: "retry_boundary_weakened" };
    }
    const proposalFingerprint = exact(input.proposalFingerprint);
    const baselineFingerprint = exact(input.baselineFingerprint);
    const proposedFingerprint = exact(input.proposedFingerprint);
    const goalSection3Fingerprint = exact(input.goalSection3Fingerprint);
    const reviewerRef = exact(input.reviewerRef);
    if (!proposalFingerprint || !baselineFingerprint || !proposedFingerprint || !goalSection3Fingerprint
        || !reviewerRef || baselineFingerprint === proposedFingerprint
        || !Number.isSafeInteger(input.reviewedAt) || input.reviewedAt < 0
        || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.reviewedAt) {
        return { status: "blocked", reasonCode: "delegation_review_lineage_invalid" };
    }
    return {
        status: "authorized",
        receipt: {
            schemaVersion: 1,
            invariant: "delegation_rules",
            decision: "preserved",
            proposalFingerprint,
            baselineFingerprint,
            proposedFingerprint,
            goalSection3Fingerprint,
            reviewerRef,
            reviewedAt: input.reviewedAt,
            expiresAt: input.expiresAt,
            evidenceRef: exact(snapshot.evidenceRef),
            handoffRequiredFields: [...snapshot.handoffRequiredFields],
            parentActions: [...snapshot.parentActions],
        },
    };
}
export function projectDelegationRulesInvariantReview(input) {
    const receipt = input.receipt;
    if (receipt.schemaVersion !== 1 || receipt.invariant !== "delegation_rules" || receipt.decision !== "preserved"
        || !exact(receipt.proposalFingerprint) || !exact(receipt.baselineFingerprint)
        || !exact(receipt.proposedFingerprint) || receipt.baselineFingerprint === receipt.proposedFingerprint
        || !exact(receipt.goalSection3Fingerprint) || !exact(receipt.reviewerRef) || !exact(receipt.evidenceRef)
        || !exactSet(REQUIRED_DELEGATION_HANDOFF_FIELDS, receipt.handoffRequiredFields)
        || !exactSet(REQUIRED_PARENT_DELEGATION_ACTIONS, receipt.parentActions)
        || !Number.isSafeInteger(receipt.reviewedAt) || !Number.isSafeInteger(receipt.expiresAt)
        || !Number.isSafeInteger(input.now) || receipt.reviewedAt > input.now) {
        return { status: "blocked", reasonCode: "delegation_review_receipt_invalid" };
    }
    if (receipt.expiresAt <= input.now)
        return { status: "blocked", reasonCode: "delegation_review_expired" };
    if (receipt.proposalFingerprint !== exact(input.expectedProposalFingerprint)) {
        return { status: "blocked", reasonCode: "delegation_review_scope_mismatch" };
    }
    if (receipt.goalSection3Fingerprint !== exact(input.currentGoalSection3Fingerprint)) {
        return { status: "blocked", reasonCode: "goal_section3_lineage_mismatch" };
    }
    return {
        status: "authorized",
        review: {
            invariant: "delegation_rules",
            proposalFingerprint: receipt.proposalFingerprint,
            baselineFingerprint: receipt.baselineFingerprint,
            proposedFingerprint: receipt.proposedFingerprint,
            decision: "preserved",
            reviewerRef: receipt.reviewerRef,
            reviewedAt: receipt.reviewedAt,
            expiresAt: receipt.expiresAt,
        },
    };
}
//# sourceMappingURL=prompt-improvement-delegation-invariants.js.map