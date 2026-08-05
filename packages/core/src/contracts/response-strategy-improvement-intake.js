export const RESPONSE_STRATEGY_CATEGORIES = [
    "request_analysis",
    "clarification",
    "solution_path",
    "failure_report",
    "next_action",
    "delegation",
];
export const RESPONSE_EVIDENCE_SIGNAL_KINDS = [
    "repeated_request",
    "repeated_failure",
    "clarification_request",
    "satisfaction",
    "dissatisfaction",
    "correction",
];
const TYPED_REFERENCE = /^[a-z][a-z0-9_-]*:[^\s]+$/u;
const STYLE_ONLY = /^(?:tone|style|personality|verbosity|말투|어조|스타일|성격|장황함)$/iu;
const PROTECTED_ACTION = String.raw `(?:ignore|remove|disable|bypass|weaken|override|무시|제거|비활성화|우회|약화|덮어쓰기)`;
const PROTECTED_AXIS = String.raw `(?:safety|identity|permission|memory|language|approval|안전|정체성|권한|메모리|언어|승인)`;
const PROTECTED_INVARIANT_WEAKENING = new RegExp(String.raw `(?:${PROTECTED_ACTION}[\s\S]{0,48}${PROTECTED_AXIS}|${PROTECTED_AXIS}[\s\S]{0,48}${PROTECTED_ACTION})`, "iu");
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function reference(value, field) {
    const normalized = required(value, field);
    if (!TYPED_REFERENCE.test(normalized))
        throw new Error(`${field} must be a typed reference.`);
    return normalized;
}
function time(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer.`);
    return value;
}
export function buildResponseStrategyImprovementIntake(input) {
    const agentId = required(input.agent.agentId, "Agent ID");
    const agentName = required(input.agent.agentName, "Agent name");
    const ownershipSnapshotFingerprint = required(input.ownershipSnapshotFingerprint, "Ownership snapshot fingerprint");
    const owned = new Set(input.ownedPromptSourceRefs.map((value) => reference(value, "Owned prompt source reference")));
    if (owned.size === 0)
        throw new Error("At least one owned prompt source is required.");
    const trigger = input.trigger;
    if (!trigger || (trigger.source !== "explicit_user_request" && trigger.source !== "approved_operational_event")) {
        return { status: "rejected", reasonCode: "explicit_trigger_required" };
    }
    required(trigger.triggerId, "Improvement trigger ID");
    if (trigger.targetAgentId !== agentId)
        return { status: "rejected", reasonCode: "trigger_agent_mismatch" };
    if (trigger.requestedPromptSourceRefs.length === 0)
        return { status: "rejected", reasonCode: "target_not_owned" };
    const requested = trigger.requestedPromptSourceRefs.map((value) => reference(value, "Requested prompt source reference"));
    if (requested.some((value) => !owned.has(value)))
        return { status: "rejected", reasonCode: "target_not_owned" };
    if (input.evidence.length === 0)
        return { status: "rejected", reasonCode: "evidence_required" };
    const receiptRefs = new Set();
    const evidence = input.evidence.map((signal) => {
        const interactionReceiptRef = reference(signal.interactionReceiptRef, "Interaction receipt reference");
        if (receiptRefs.has(interactionReceiptRef))
            throw new Error(`Evidence receipt references must be unique: ${interactionReceiptRef}.`);
        receiptRefs.add(interactionReceiptRef);
        const windowStartedAt = time(signal.windowStartedAt, "Evidence window start");
        const windowEndedAt = time(signal.windowEndedAt, "Evidence window end");
        if (windowEndedAt < windowStartedAt)
            throw new Error("Evidence window end cannot precede its start.");
        if (!Number.isSafeInteger(signal.occurrenceCount) || signal.occurrenceCount < 1)
            throw new Error("Evidence occurrence count must be positive.");
        return {
            ...signal,
            interactionReceiptRef,
            observedBehavior: required(signal.observedBehavior, "Observed behavior"),
            expectedBehavior: required(signal.expectedBehavior, "Expected behavior"),
            windowStartedAt,
            windowEndedAt,
        };
    });
    if (evidence.some((signal) => signal.occurrenceCount < 2)) {
        return { status: "rejected", reasonCode: "evidence_not_repeated" };
    }
    const candidate = input.candidate;
    if (!RESPONSE_STRATEGY_CATEGORIES.includes(candidate.category)) {
        if (STYLE_ONLY.test(String(candidate.category).trim()))
            return { status: "rejected", reasonCode: "style_only_change" };
        throw new Error(`Unsupported response strategy category: ${String(candidate.category)}.`);
    }
    const targetPromptSourceRef = reference(candidate.targetPromptSourceRef, "Candidate target prompt source reference");
    if (!requested.includes(targetPromptSourceRef))
        return { status: "rejected", reasonCode: "candidate_target_mismatch" };
    const normalizedCandidate = {
        category: candidate.category,
        targetPromptSourceRef,
        currentBehavior: required(candidate.currentBehavior, "Current behavior"),
        desiredBehavior: required(candidate.desiredBehavior, "Desired behavior"),
        successCriterion: required(candidate.successCriterion, "Success criterion"),
        evidenceReceiptRefs: candidate.evidenceReceiptRefs.map((value) => reference(value, "Candidate evidence receipt reference")),
    };
    if (normalizedCandidate.evidenceReceiptRefs.length === 0
        || normalizedCandidate.evidenceReceiptRefs.some((value) => !receiptRefs.has(value)))
        return { status: "rejected", reasonCode: "evidence_required" };
    const linkedEvidence = evidence.filter((signal) => normalizedCandidate.evidenceReceiptRefs.includes(signal.interactionReceiptRef));
    if (!linkedEvidence.some((signal) => signal.observedBehavior === normalizedCandidate.currentBehavior
        && signal.expectedBehavior === normalizedCandidate.desiredBehavior)) {
        return { status: "rejected", reasonCode: "candidate_behavior_evidence_mismatch" };
    }
    if (PROTECTED_INVARIANT_WEAKENING.test(normalizedCandidate.desiredBehavior)) {
        return { status: "rejected", reasonCode: "protected_invariant_weakening" };
    }
    return {
        status: "ready",
        intake: {
            schemaVersion: 1,
            agent: { agentId, agentName, agentType: input.agent.agentType },
            trigger: { ...trigger, requestedPromptSourceRefs: [...requested] },
            ownershipSnapshotFingerprint,
            evidence,
            candidate: normalizedCandidate,
            harnessInput: {
                targetPromptSources: [targetPromptSourceRef],
                agentOwnedPromptScope: [...owned],
                userReactionEvidence: [...receiptRefs],
                responseStrategyTarget: normalizedCandidate.category,
                currentBehavior: normalizedCandidate.currentBehavior,
                desiredBehavior: normalizedCandidate.desiredBehavior,
                requiredTests: [normalizedCandidate.successCriterion],
            },
        },
    };
}
//# sourceMappingURL=response-strategy-improvement-intake.js.map