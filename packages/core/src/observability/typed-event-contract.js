const IDENTIFIER_KEYS = [
    "requestId",
    "requestGroupId",
    "rootRunId",
    "runId",
];
const WORK_KINDS = new Set([
    "analysis_started",
    "analysis_completed",
    "execution_started",
    "execution_completed",
    "evidence_recorded",
    "review_completed",
    "recovery_started",
    "recovery_completed",
    "finalization_completed",
]);
const ATTEMPT_KINDS = new Set([
    "execution_started",
    "execution_completed",
    "evidence_recorded",
    "recovery_started",
    "recovery_completed",
]);
const REVIEW_KINDS = new Set(["review_completed", "finalization_completed"]);
const RECOVERY_KINDS = new Set(["recovery_started", "recovery_completed"]);
const UNSAFE_ATTRIBUTE_KEY = /(?:raw|prompt|memory|secret|token|password|credential|authorization|cookie|stack|path|body|response)/iu;
const INTERNAL_ID_ATTRIBUTE_KEY = /(?:request|group|rootRun|run|work|attempt|evidence|review|recovery|agent|session)(?:_?id|Id)$/u;
const UNSAFE_TEXT = /(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\|Bearer\s+|\bsk-[A-Za-z0-9_-]{8,}|\bxox[baprs]-)/u;
const REASON_CODE = /^[a-z][a-z0-9_]{1,79}$/u;
const STAGE_RANK = {
    request_received: 0,
    analysis_started: 1,
    analysis_completed: 1,
    execution_started: 2,
    execution_completed: 2,
    evidence_recorded: 3,
    review_completed: 4,
    recovery_started: 2,
    recovery_completed: 2,
    finalization_completed: 5,
};
function nonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function requiredCorrelationReason(kind, correlation) {
    if (IDENTIFIER_KEYS.some((key) => !nonEmpty(correlation[key])))
        return "correlation_id_required";
    if (WORK_KINDS.has(kind) && !nonEmpty(correlation.workId))
        return "work_id_required";
    if (ATTEMPT_KINDS.has(kind) && !nonEmpty(correlation.attemptId))
        return "attempt_id_required";
    if (kind === "evidence_recorded" && !nonEmpty(correlation.evidenceId))
        return "evidence_id_required";
    if (REVIEW_KINDS.has(kind) && !nonEmpty(correlation.reviewId))
        return "review_id_required";
    if (RECOVERY_KINDS.has(kind) && !nonEmpty(correlation.recoveryId))
        return "recovery_id_required";
    return null;
}
export function buildTypedObservabilityEvent(input) {
    if (!nonEmpty(input.eventId))
        return { status: "rejected", reasonCode: "event_id_required" };
    if (!Number.isFinite(input.at) || input.at < 0)
        return { status: "rejected", reasonCode: "invalid_timestamp" };
    const correlationReason = requiredCorrelationReason(input.kind, input.correlation);
    if (correlationReason)
        return { status: "rejected", reasonCode: correlationReason };
    if (!REASON_CODE.test(input.reasonCode))
        return { status: "rejected", reasonCode: "reason_code_invalid" };
    const summary = input.summary.trim();
    if (!summary || summary.length > 240 || /[\r\n]/u.test(summary)) {
        return { status: "rejected", reasonCode: "summary_invalid" };
    }
    if (UNSAFE_TEXT.test(summary))
        return { status: "rejected", reasonCode: "unsafe_summary" };
    for (const [key, value] of Object.entries(input.attributes ?? {})) {
        if (UNSAFE_ATTRIBUTE_KEY.test(key) || (input.purpose === "product" && INTERNAL_ID_ATTRIBUTE_KEY.test(key))) {
            return { status: "rejected", reasonCode: "unsafe_attribute_key" };
        }
        if (typeof value === "string" && (value.length > 240 || UNSAFE_TEXT.test(value) || /[\r\n]/u.test(value))) {
            return { status: "rejected", reasonCode: "unsafe_attribute_value" };
        }
    }
    return {
        status: "ready",
        event: Object.freeze({
            ...input,
            eventId: input.eventId.trim(),
            reasonCode: input.reasonCode.trim(),
            summary,
            correlation: Object.freeze({ ...input.correlation }),
            ...(input.attributes ? { attributes: Object.freeze({ ...input.attributes }) } : {}),
        }),
    };
}
function sameCorrelationRoot(left, right) {
    return left.requestGroupId === right.requestGroupId
        && left.rootRunId === right.rootRunId;
}
export function projectTypedObservabilityTrace(input) {
    const events = [...input].sort((left, right) => (left.at - right.at) || left.eventId.localeCompare(right.eventId));
    const issues = [];
    const first = events[0];
    const runIds = new Set(events.map((event) => event.correlation.runId));
    const highestStageByScope = new Map();
    const finalizationCountByScope = new Map();
    const evidenceById = new Map();
    const reviewById = new Map();
    for (const event of events) {
        if (first && event.correlation.requestId !== first.correlation.requestId) {
            issues.push({ code: "cross_request_link", eventId: event.eventId });
        }
        if (first && !sameCorrelationRoot(event.correlation, first.correlation)) {
            issues.push({ code: "correlation_mismatch", eventId: event.eventId });
        }
        if (event.correlation.parentRunId && !runIds.has(event.correlation.parentRunId)) {
            issues.push({ code: "missing_parent_run", eventId: event.eventId });
        }
        const scopeKey = `${event.correlation.runId}:${event.correlation.workId ?? "request"}`;
        const stage = STAGE_RANK[event.kind];
        const highestStage = highestStageByScope.get(scopeKey) ?? -1;
        if (stage < highestStage && !event.kind.startsWith("recovery_")) {
            issues.push({ code: "stage_regression", eventId: event.eventId });
        }
        highestStageByScope.set(scopeKey, event.kind === "recovery_completed" ? stage : Math.max(highestStage, stage));
        if (event.kind === "evidence_recorded" && event.correlation.evidenceId) {
            evidenceById.set(event.correlation.evidenceId, event);
        }
        if (event.kind === "review_completed" && event.correlation.reviewId) {
            const evidence = event.correlation.evidenceId
                ? evidenceById.get(event.correlation.evidenceId)
                : undefined;
            if (event.correlation.evidenceId && (!evidence
                || evidence.correlation.workId !== event.correlation.workId
                || evidence.correlation.runId !== event.correlation.runId)) {
                issues.push({ code: "evidence_review_mismatch", eventId: event.eventId });
            }
            reviewById.set(event.correlation.reviewId, event);
        }
        if (event.kind === "finalization_completed") {
            const finalizationCount = (finalizationCountByScope.get(scopeKey) ?? 0) + 1;
            finalizationCountByScope.set(scopeKey, finalizationCount);
            if (finalizationCount > 1) {
                issues.push({ code: "duplicate_finalization", eventId: event.eventId });
            }
            const review = event.correlation.reviewId
                ? reviewById.get(event.correlation.reviewId)
                : undefined;
            if (!review
                || review.correlation.workId !== event.correlation.workId
                || review.correlation.runId !== event.correlation.runId) {
                issues.push({ code: "unknown_review", eventId: event.eventId });
            }
        }
    }
    const finalizationCount = [...finalizationCountByScope.values()].reduce((sum, count) => sum + count, 0);
    return {
        requestId: first?.correlation.requestId ?? null,
        events,
        issues,
        terminal: finalizationCount > 0 && issues.every((issue) => ![
            "duplicate_finalization",
            "unknown_review",
            "cross_request_link",
            "correlation_mismatch",
        ].includes(issue.code)),
    };
}
//# sourceMappingURL=typed-event-contract.js.map