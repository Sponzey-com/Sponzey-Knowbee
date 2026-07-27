const WEB_PATHS = [
    "source_fetch",
    "alternate_source",
    "dedicated_api",
    "skill_or_mcp",
    "other_means",
];
function normalized(value) {
    return value.trim();
}
function uniqueText(values, allowEmpty = false) {
    if (!Array.isArray(values) || (!allowEmpty && values.length === 0))
        return false;
    const normalizedValues = values.map(normalized);
    return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length;
}
export function isValidResolutionAttemptRecord(record) {
    const failed = record.validation.status !== "sufficient";
    return Boolean(normalized(record.attemptId) &&
        normalized(record.workId) &&
        normalized(record.stepId) &&
        normalized(record.meansId) &&
        uniqueText(record.inputRefs) &&
        normalized(record.targetId) &&
        normalized(record.strategyFingerprint) &&
        uniqueText(record.resultRefs) &&
        uniqueText(record.validation.evidenceRefs) &&
        normalized(record.validation.reason) &&
        (failed ? normalized(record.failureCause ?? "") : !record.failureCause));
}
function sameInputs(left, right) {
    return (left.length === right.length &&
        left.every((value, index) => normalized(value) === normalized(right[index] ?? "")));
}
function sameAttempt(prior, next) {
    return (normalized(prior.meansId) === normalized(next.meansId) &&
        sameInputs(prior.inputRefs, next.inputRefs) &&
        normalized(prior.targetId) === normalized(next.targetId) &&
        normalized(prior.strategyFingerprint) === normalized(next.strategyFingerprint));
}
export function admitNextResolutionAttempt(input) {
    const workId = normalized(input.workId);
    const next = input.nextAttempt;
    if (!workId ||
        !normalized(input.unresolvedGoal) ||
        !normalized(next.attemptId) ||
        !normalized(next.meansId) ||
        !uniqueText(next.inputRefs) ||
        !normalized(next.targetId) ||
        !normalized(next.strategyFingerprint)) {
        return { status: "rejected", reasonCodes: ["resolution_input_invalid"] };
    }
    if (!input.priorAttempts.every((attempt) => isValidResolutionAttemptRecord(attempt) && normalized(attempt.workId) === workId)) {
        return { status: "rejected", reasonCodes: ["attempt_record_invalid"] };
    }
    if (input.priorAttempts.some((attempt) => normalized(attempt.attemptId) === normalized(next.attemptId))) {
        return { status: "rejected", reasonCodes: ["attempt_id_duplicate"] };
    }
    if (input.priorAttempts.some((attempt) => sameAttempt(attempt, next))) {
        return { status: "rejected", reasonCodes: ["unchanged_attempt"] };
    }
    const previous = input.priorAttempts.at(-1);
    const changedDimensions = [];
    if (!previous || normalized(previous.meansId) !== normalized(next.meansId))
        changedDimensions.push("means");
    if (!previous || !sameInputs(previous.inputRefs, next.inputRefs))
        changedDimensions.push("input");
    if (!previous || normalized(previous.targetId) !== normalized(next.targetId))
        changedDimensions.push("target");
    if (!previous ||
        normalized(previous.strategyFingerprint) !== normalized(next.strategyFingerprint))
        changedDimensions.push("strategy");
    return { status: "allowed", workId, attemptId: normalized(next.attemptId), changedDimensions };
}
export function admitIncompleteWebRecovery(input) {
    const workId = normalized(input.workId);
    if (!workId)
        return { status: "rejected", reasonCodes: ["web_recovery_input_invalid"] };
    if (!isValidResolutionAttemptRecord(input.failedSearchAttempt) ||
        normalized(input.failedSearchAttempt.workId) !== workId ||
        normalized(input.failedSearchAttempt.meansId) !== "web_search" ||
        input.failedSearchAttempt.validation.status === "sufficient") {
        return { status: "rejected", reasonCodes: ["failed_search_attempt_invalid"] };
    }
    const byPath = new Map(input.pathReviews.map((review) => [review.path, review]));
    if (byPath.size !== input.pathReviews.length ||
        input.pathReviews.some((review) => !WEB_PATHS.includes(review.path) ||
            (review.status === "unreviewed"
                ? review.evidenceRefs.length > 0
                : !uniqueText(review.evidenceRefs)))) {
        return { status: "rejected", reasonCodes: ["path_reviews_invalid"] };
    }
    const availablePaths = WEB_PATHS.filter((path) => byPath.get(path)?.status === "available");
    const unreviewedPaths = WEB_PATHS.filter((path) => !byPath.has(path) || byPath.get(path)?.status === "unreviewed");
    if (input.selectedPath) {
        const selected = byPath.get(input.selectedPath);
        if (selected?.status !== "available")
            return { status: "rejected", reasonCodes: ["selected_path_unavailable"] };
        return {
            status: "selected",
            workId,
            path: input.selectedPath,
            evidenceRefs: selected.evidenceRefs.map(normalized),
        };
    }
    if (availablePaths.length > 0 || unreviewedPaths.length > 0)
        return { status: "continue", workId, availablePaths, unreviewedPaths };
    return { status: "exhausted", workId, reviewedPaths: [...WEB_PATHS] };
}
//# sourceMappingURL=recursive-resolution-admission.js.map