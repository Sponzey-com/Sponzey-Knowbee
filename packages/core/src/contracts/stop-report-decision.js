export function normalizeStartupAttemptLimitPolicy(input) {
    const policyVersion = required(input.policyVersion, "Attempt policy version");
    const maxTurns = nonNegative(input.maxTurns, "Maximum turns");
    const maxRetries = nonNegative(input.maxRetries ?? input.maxTurns, "Maximum retries");
    if (maxTurns === 0)
        return { kind: "unbounded", policyVersion };
    return { kind: "bounded", maxTurns, maxRetries, policyVersion };
}
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function nonNegative(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer.`);
    return value;
}
function unique(values, field) {
    const normalized = values.map((value) => required(value, field));
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} values must be unique.`);
    return normalized;
}
export function evaluateBlockedStopReportDecision(input) {
    const goalId = required(input.goalId, "Goal ID");
    const receiptId = required(input.exhaustion.receiptId, "Diagnosis receipt ID");
    const missingPaths = unique(input.exhaustion.missingPaths, "Missing solution path");
    const unresolvedItemIds = unique(input.unresolvedItemIds, "Unresolved item ID");
    if (!input.exhaustion.complete || !input.exhaustion.canFinalizeFailure || missingPaths.length > 0) {
        return { status: "continue", reasonCode: "solution_paths_remaining", remainingPathIds: missingPaths };
    }
    if (unresolvedItemIds.length === 0)
        throw new Error("Blocked stop requires unresolved items.");
    const exhaustionEvidence = unique(input.exhaustion.evidenceRefs, "Solution-path evidence");
    if (exhaustionEvidence.length === 0)
        throw new Error("Exhausted solution paths require evidence.");
    const partialResultRefs = unique(input.exhaustion.partialResultRefs, "Partial result reference");
    const workaroundGuidance = unique(input.exhaustion.workaroundGuidance, "Workaround guidance");
    if (input.permissionDenial) {
        required(input.permissionDenial.permissionKind, "Permission kind");
        required(input.permissionDenial.targetRef, "Permission target reference");
        const permissionEvidence = unique(input.permissionDenial.evidenceRefs, "Permission denial evidence");
        if (permissionEvidence.length === 0)
            throw new Error("Permission denial requires evidence.");
        const alternatives = unique(input.permissionDenial.safeAlternativePathIds, "Safe alternative path ID");
        if (alternatives.length > 0) {
            return { status: "continue", reasonCode: "solution_paths_remaining", remainingPathIds: alternatives };
        }
        return {
            status: "stop_and_report",
            reasonCode: "permission_denied",
            reportInput: {
                goalId,
                reasonCode: "permission_denied",
                diagnosisReceiptId: receiptId,
                evidenceRefs: unique([...exhaustionEvidence, ...permissionEvidence], "Terminal evidence ref"),
                unresolvedItemIds,
                partialResultRefs,
                nextActions: workaroundGuidance,
            },
        };
    }
    if (input.impossibility) {
        required(input.impossibility.reasonCode, "Impossibility reason code");
        const facts = unique(input.impossibility.verifiedFacts, "Verified impossibility fact");
        const evidence = unique(input.impossibility.evidenceRefs, "Impossibility evidence");
        if (facts.length === 0 || evidence.length === 0)
            throw new Error("Concrete impossibility requires verified facts and evidence.");
        const requiredChanges = unique(input.impossibility.requiredChanges, "Required change");
        if (input.impossibility.recoverable) {
            if (requiredChanges.length === 0)
                throw new Error("Recoverable impossibility requires at least one required change.");
            return { status: "blocked_pending_input", reasonCode: "recoverable_condition", requiredChanges };
        }
        return {
            status: "stop_and_report",
            reasonCode: "concrete_impossibility",
            reportInput: {
                goalId,
                reasonCode: "concrete_impossibility",
                diagnosisReceiptId: receiptId,
                evidenceRefs: unique([...exhaustionEvidence, ...evidence], "Terminal evidence ref"),
                unresolvedItemIds,
                partialResultRefs,
                nextActions: unique([...workaroundGuidance, ...requiredChanges], "Terminal next action"),
            },
        };
    }
    return {
        status: "stop_and_report",
        reasonCode: "solution_paths_exhausted",
        reportInput: {
            goalId,
            reasonCode: "solution_paths_exhausted",
            diagnosisReceiptId: receiptId,
            evidenceRefs: exhaustionEvidence,
            unresolvedItemIds,
            partialResultRefs,
            nextActions: workaroundGuidance,
        },
    };
}
export function evaluateStopReportDecision(input) {
    const goalId = required(input.completion.goalId, "Goal ID");
    const expected = unique(input.completion.expectedCriterionIds, "Expected criterion ID");
    const satisfied = new Set(unique(input.completion.satisfiedCriterionIds, "Satisfied criterion ID"));
    const unresolvedItemIds = unique(input.completion.unresolvedItemIds, "Unresolved item ID");
    const currentTurn = nonNegative(input.attempts.currentTurn, "Current turn");
    const currentRetry = nonNegative(input.attempts.currentRetry, "Current retry");
    const policyVersion = required(input.policy.policyVersion, "Attempt policy version");
    if (input.policy.kind === "bounded") {
        if (!Number.isSafeInteger(input.policy.maxTurns) || input.policy.maxTurns <= 0)
            throw new Error("maxTurns must be a positive integer.");
        if (!Number.isSafeInteger(input.policy.maxRetries) || input.policy.maxRetries < 0)
            throw new Error("maxRetries must be a non-negative integer.");
    }
    const missingCriterionIds = expected.filter((criterionId) => {
        const evidence = input.completion.evidenceRefsByCriterion[criterionId] ?? [];
        return !satisfied.has(criterionId) || unique(evidence, `Evidence for ${criterionId}`).length === 0;
    });
    const completionClaimed = expected.length > 0 && input.completion.satisfiedCriterionIds.length > 0;
    if (completionClaimed && missingCriterionIds.length > 0) {
        return { status: "blocked_pending_input", reasonCode: "completion_evidence_incomplete", missingCriterionIds };
    }
    if (expected.length > 0 && missingCriterionIds.length === 0 && unresolvedItemIds.length === 0) {
        const evidenceRefs = unique(expected.flatMap((criterionId) => input.completion.evidenceRefsByCriterion[criterionId] ?? []), "Completion evidence ref");
        return { status: "stop_and_report", reasonCode: "goal_achieved", reportInput: { goalId, reasonCode: "goal_achieved", evidenceRefs, unresolvedItemIds: [], currentTurn, currentRetry, policyVersion } };
    }
    if (input.policy.kind === "bounded" && currentTurn >= input.policy.maxTurns) {
        return {
            status: "reassess_strategy",
            event: "REASSESS_STRATEGY",
            reasonCode: "turn_observation_threshold_reached",
            currentTurn,
            currentRetry,
            nextTurn: currentTurn + 1,
            policyVersion,
        };
    }
    if (input.policy.kind === "bounded" && currentRetry >= input.policy.maxRetries) {
        return {
            status: "reassess_strategy",
            event: "REASSESS_STRATEGY",
            reasonCode: "retry_observation_threshold_reached",
            currentTurn,
            currentRetry,
            nextTurn: currentTurn + 1,
            policyVersion,
        };
    }
    return { status: "continue", nextTurn: currentTurn + 1 };
}
export async function executeContinuingAction(input) {
    if (input.decision.status !== "continue")
        return input.decision;
    return { status: "executed", result: await input.execute() };
}
//# sourceMappingURL=stop-report-decision.js.map