import { admitNextResolutionAttempt, isValidResolutionAttemptRecord, } from "./recursive-resolution-admission.js";
const RESOURCE_DIMENSIONS = [
    { key: "wallTimeMs", dimension: "wall_time" },
    { key: "modelTokens", dimension: "model_tokens" },
    { key: "externalCostMicros", dimension: "external_cost" },
    { key: "executionTimeMs", dimension: "execution_time" },
];
function normalized(value) {
    return value.trim();
}
function uniqueText(values) {
    if (!Array.isArray(values) || values.length === 0)
        return false;
    const normalizedValues = values.map(normalized);
    return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length;
}
function validCandidate(candidate) {
    return Boolean(normalized(candidate.candidateId) &&
        normalized(candidate.meansId) &&
        uniqueText(candidate.inputRefs) &&
        normalized(candidate.targetId) &&
        normalized(candidate.strategyFingerprint) &&
        (candidate.goalCompletionProspect === "plausible" ||
            candidate.goalCompletionProspect === "implausible") &&
        (candidate.permissionStatus === "allowed" || candidate.permissionStatus === "denied") &&
        (candidate.connectionStatus === "connected" ||
            candidate.connectionStatus === "not_required" ||
            candidate.connectionStatus === "unavailable") &&
        (candidate.policyStatus === "allowed" || candidate.policyStatus === "denied") &&
        typeof candidate.capabilityConfirmed === "boolean" &&
        typeof candidate.executable === "boolean" &&
        uniqueText(candidate.evidenceRefs));
}
function validResourceValues(values, allowZero) {
    return RESOURCE_DIMENSIONS.every(({ key }) => {
        const value = values[key];
        return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
    });
}
export function detectResolutionCycles(attempts) {
    if (!attempts.every(isValidResolutionAttemptRecord)) {
        return { status: "rejected", reasonCodes: ["attempt_ledger_invalid"] };
    }
    const occurrences = new Map();
    for (const attempt of attempts) {
        const failureCause = normalized(attempt.failureCause ?? "");
        if (!failureCause)
            continue;
        const strategyFingerprint = normalized(attempt.strategyFingerprint);
        const key = `${failureCause}\u0000${strategyFingerprint}`;
        const existing = occurrences.get(key);
        if (existing) {
            existing.attemptIds.push(normalized(attempt.attemptId));
        }
        else {
            occurrences.set(key, {
                failureCause,
                strategyFingerprint,
                attemptIds: [normalized(attempt.attemptId)],
            });
        }
    }
    const cycles = [...occurrences.values()].filter((cycle) => cycle.attemptIds.length > 1);
    if (cycles.length === 0)
        return { status: "no_cycle", cycles: [], blockedStrategyFingerprints: [] };
    return {
        status: "cycle_detected",
        cycles,
        blockedStrategyFingerprints: [...new Set(cycles.map((cycle) => cycle.strategyFingerprint))],
    };
}
export function evaluateRecursiveContinuation(input) {
    const workId = normalized(input.workId);
    if (!workId ||
        !normalized(input.unresolvedGoal) ||
        !Number.isInteger(input.retryCount) ||
        input.retryCount < 0) {
        return { status: "rejected", reasonCodes: ["continuation_input_invalid"] };
    }
    if (!input.priorAttempts.every((attempt) => isValidResolutionAttemptRecord(attempt) && normalized(attempt.workId) === workId)) {
        return { status: "rejected", reasonCodes: ["attempt_ledger_invalid"] };
    }
    if (!input.candidates.every(validCandidate) ||
        new Set(input.candidates.map((candidate) => normalized(candidate.candidateId))).size !==
            input.candidates.length) {
        return { status: "rejected", reasonCodes: ["candidate_snapshot_invalid"] };
    }
    const cycleResult = detectResolutionCycles(input.priorAttempts);
    const blockedStrategies = new Set(cycleResult.status === "cycle_detected" ? cycleResult.blockedStrategyFingerprints : []);
    const excludedCandidates = [];
    const viableCandidateIds = [];
    for (const candidate of input.candidates) {
        const reasonCodes = [];
        if (candidate.permissionStatus === "denied")
            reasonCodes.push("permission_denied");
        if (candidate.connectionStatus === "unavailable")
            reasonCodes.push("connection_unavailable");
        if (candidate.policyStatus === "denied")
            reasonCodes.push("policy_denied");
        if (!candidate.capabilityConfirmed)
            reasonCodes.push("capability_unconfirmed");
        if (!candidate.executable)
            reasonCodes.push("not_executable");
        if (candidate.goalCompletionProspect === "implausible")
            reasonCodes.push("goal_implausible");
        if (blockedStrategies.has(normalized(candidate.strategyFingerprint)))
            reasonCodes.push("cycle_detected");
        const admission = admitNextResolutionAttempt({
            workId,
            unresolvedGoal: input.unresolvedGoal,
            priorAttempts: input.priorAttempts,
            nextAttempt: {
                attemptId: candidate.candidateId,
                meansId: candidate.meansId,
                inputRefs: candidate.inputRefs,
                targetId: candidate.targetId,
                strategyFingerprint: candidate.strategyFingerprint,
            },
        });
        if (admission.status === "rejected" && admission.reasonCodes.includes("unchanged_attempt"))
            reasonCodes.push("unchanged_attempt");
        if (reasonCodes.length > 0) {
            excludedCandidates.push({ candidateId: normalized(candidate.candidateId), reasonCodes });
        }
        else {
            viableCandidateIds.push(normalized(candidate.candidateId));
        }
    }
    if (viableCandidateIds.length > 0)
        return { status: "continue", viableCandidateIds };
    return {
        status: "reassess",
        reason: "no_viable_changed_candidate",
        scope: {
            kind: "current_runtime_snapshot",
            workId,
            evaluatedCandidateIds: input.candidates.map((candidate) => normalized(candidate.candidateId)),
        },
        excludedCandidates,
    };
}
export function evaluateResolutionResources(input) {
    if (!validResourceValues(input.consumed, true) ||
        !validResourceValues(input.limits, false) ||
        !Number.isFinite(input.reassessAtRatio) ||
        input.reassessAtRatio <= 0 ||
        input.reassessAtRatio >= 1) {
        return { status: "rejected", reasonCodes: ["resource_snapshot_invalid"] };
    }
    const exceeded = RESOURCE_DIMENSIONS.filter(({ key }) => input.consumed[key] >= input.limits[key]).map(({ dimension }) => dimension);
    if (exceeded.length > 0)
        return { status: "user_decision_required", dimensions: exceeded };
    const approaching = RESOURCE_DIMENSIONS.filter(({ key }) => input.consumed[key] / input.limits[key] >= input.reassessAtRatio).map(({ dimension }) => dimension);
    if (approaching.length > 0)
        return { status: "reassess", dimensions: approaching };
    return {
        status: "continue",
        remaining: {
            wallTimeMs: input.limits.wallTimeMs - input.consumed.wallTimeMs,
            modelTokens: input.limits.modelTokens - input.consumed.modelTokens,
            externalCostMicros: input.limits.externalCostMicros - input.consumed.externalCostMicros,
            executionTimeMs: input.limits.executionTimeMs - input.consumed.executionTimeMs,
        },
    };
}
export function bindResourceReassessment(input) {
    const reasonCodes = [];
    if (input.resourceDecision.status !== "reassess")
        reasonCodes.push("resource_reassessment_not_required");
    if (!uniqueText(input.currentEvidenceRefs))
        reasonCodes.push("current_evidence_missing");
    if (input.continuationDecision.status !== "continue" ||
        input.continuationDecision.viableCandidateIds.length === 0)
        reasonCodes.push("changed_candidate_missing");
    if (reasonCodes.length > 0)
        return { status: "rejected", reasonCodes };
    return {
        status: "reassess",
        dimensions: input.resourceDecision.status === "reassess" ? input.resourceDecision.dimensions : [],
        currentEvidenceRefs: input.currentEvidenceRefs.map(normalized),
        changedCandidateIds: input.continuationDecision.status === "continue"
            ? input.continuationDecision.viableCandidateIds.map(normalized)
            : [],
    };
}
export function buildResourceDecisionRequest(input) {
    const reasonCodes = [];
    if (!normalized(input.workId) || input.resourceDecision.status !== "user_decision_required")
        reasonCodes.push("resource_decision_not_required");
    if (!uniqueText(input.progress.attemptedStepIds) ||
        !uniqueText(input.progress.unresolvedCriteria) ||
        !uniqueText(input.progress.evidenceRefs) ||
        !Array.isArray(input.progress.completedStepIds) ||
        input.progress.completedStepIds.some((stepId) => !normalized(stepId) ||
            !input.progress.attemptedStepIds.map(normalized).includes(normalized(stepId))) ||
        new Set(input.progress.completedStepIds.map(normalized)).size !==
            input.progress.completedStepIds.length) {
        reasonCodes.push("progress_snapshot_invalid");
    }
    const requestedDimensions = input.requestedIncreases.map((item) => item.dimension);
    const requiredDimensions = input.resourceDecision.status === "user_decision_required"
        ? input.resourceDecision.dimensions
        : [];
    if (requestedDimensions.length !== requiredDimensions.length ||
        new Set(requestedDimensions).size !== requestedDimensions.length ||
        requiredDimensions.some((dimension) => !requestedDimensions.includes(dimension))) {
        reasonCodes.push("resource_decision_not_exact");
    }
    if (input.requestedIncreases.some((item) => !Number.isFinite(item.additionalAmount) || item.additionalAmount <= 0)) {
        reasonCodes.push("resource_increment_invalid");
    }
    if (reasonCodes.length > 0)
        return { status: "rejected", reasonCodes };
    return {
        status: "user_decision_required",
        workId: normalized(input.workId),
        progress: {
            attemptedStepIds: input.progress.attemptedStepIds.map(normalized),
            completedStepIds: input.progress.completedStepIds.map(normalized),
            unresolvedCriteria: input.progress.unresolvedCriteria.map(normalized),
            evidenceRefs: input.progress.evidenceRefs.map(normalized),
        },
        requestedIncreases: input.requestedIncreases.map((item) => ({ ...item })),
    };
}
export function admitRequiredResourceUnavailableBlock(input) {
    const workId = normalized(input.workId);
    const resourceId = normalized(input.resourceId);
    const capabilitySnapshotRef = normalized(input.capabilitySnapshotRef);
    if (!workId || !resourceId || !capabilitySnapshotRef || !uniqueText(input.resourceEvidenceRefs)) {
        return { status: "rejected", reasonCodes: ["resource_block_input_invalid"] };
    }
    if (input.continuationDecision.status === "continue") {
        return { status: "rejected", reasonCodes: ["changed_candidate_remaining"] };
    }
    if (input.continuationDecision.status === "rejected") {
        return { status: "rejected", reasonCodes: ["candidate_review_incomplete"] };
    }
    if (input.continuationDecision.scope.workId !== workId) {
        return { status: "rejected", reasonCodes: ["resource_scope_mismatch"] };
    }
    const evaluatedCandidateIds = input.continuationDecision.scope.evaluatedCandidateIds;
    const excludedCandidateIds = input.continuationDecision.excludedCandidates.map((candidate) => candidate.candidateId);
    if (evaluatedCandidateIds.length !== excludedCandidateIds.length ||
        evaluatedCandidateIds.some((candidateId) => !excludedCandidateIds.includes(candidateId))) {
        return { status: "rejected", reasonCodes: ["candidate_review_incomplete"] };
    }
    return {
        status: "blocked",
        reasonCode: "required_resource_unavailable",
        workId,
        resourceId,
        evidenceRefs: [capabilitySnapshotRef, ...input.resourceEvidenceRefs.map(normalized)],
        evaluatedCandidateIds: evaluatedCandidateIds.map(normalized),
    };
}
//# sourceMappingURL=recursive-resolution-governance.js.map