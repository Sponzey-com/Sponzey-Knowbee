const INTERNAL_DETAIL = /(?:\b(?:work|receipt|diagnosis|prompt|request_id|work_id|attempt_id):|[{}[\]])/iu;
function required(value, field, maxLength = 500) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    if (normalized.length > maxLength)
        throw new Error(`${field} exceeds ${maxLength} characters.`);
    if (INTERNAL_DETAIL.test(normalized))
        throw new Error(`${field} contains internal or unsupported detail.`);
    return normalized;
}
function unique(values, field) {
    const normalized = values.map((value) => required(value, field));
    if (normalized.length === 0)
        throw new Error(`${field} requires at least one value.`);
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} values must be unique.`);
    return normalized;
}
export function buildSuccessUserReport(input) {
    return {
        status: "completed",
        actualResults: unique(input.actualResults, "Actual result"),
        evidenceSummaries: unique(input.evidenceSummaries, "Evidence summary"),
    };
}
export function buildBlockedUserReport(input) {
    const unfinishedItems = unique(input.unfinishedItems, "Unfinished item");
    const directCause = {
        text: required(input.directCause.text, "Direct cause", 320),
        evidenceSummaries: unique(input.directCause.evidenceSummaries, "Direct cause evidence"),
    };
    if (input.attemptedPaths.length === 0)
        throw new Error("Attempted paths require at least one value.");
    const attemptedPaths = input.attemptedPaths.map((path) => ({
        pathId: required(path.pathId, "Attempted path ID", 120),
        strategyFingerprint: required(path.strategyFingerprint, "Attempted path strategy", 200),
        outcome: required(path.outcome, "Attempted path outcome", 200),
    }));
    if (new Set(attemptedPaths.map((path) => path.strategyFingerprint)).size !== attemptedPaths.length) {
        throw new Error("Attempted paths must use distinct strategy fingerprints.");
    }
    return {
        status: "blocked",
        unfinishedItems,
        directCause,
        attemptedPaths,
        nextAction: {
            kind: input.nextAction.kind,
            text: required(input.nextAction.text, "Next action", 240),
        },
    };
}
export function decideUserResponseAction(input) {
    if (input.continuationDecision.status === "continue") {
        return {
            status: "continue_now",
            candidateId: input.continuationDecision.viableCandidateIds[0] ?? "",
        };
    }
    if (input.clarificationRequired)
        return { status: "request_user_input" };
    if (input.exhaustionAuthorized)
        return { status: "report_blocked" };
    return { status: "reassess" };
}
//# sourceMappingURL=user-report-continuation-admission.js.map