import { buildTypedObservabilityEvent, } from "./typed-event-contract.js";
import { recordTypedObservabilityEventSafely, } from "./typed-event-repository.js";
export function recordCanonicalRequestReceivedObservability(input) {
    const built = buildTypedObservabilityEvent({
        eventId: `typed-observability:${input.workId}:0`,
        kind: "request_received",
        purpose: "product",
        at: input.context.at,
        correlation: {
            requestId: input.context.requestId,
            requestGroupId: input.context.requestGroupId,
            rootRunId: input.context.rootRunId,
            runId: input.context.runId,
            ...(input.context.parentRunId ? { parentRunId: input.context.parentRunId } : {}),
            workId: input.workId,
        },
        reasonCode: "request_received",
        summary: "Request received",
    });
    if (built.status === "rejected")
        return built;
    return recordTypedObservabilityEventSafely({
        repository: input.repository,
        event: built.event,
        ...(input.onDegraded ? { onDegraded: input.onDegraded } : {}),
    });
}
const REVIEW_EVENTS = new Set([
    "ALL_CRITERIA_VERIFIED",
    "SOME_CRITERIA_VERIFIED",
    "POLICY_BLOCKED",
    "PATHS_EXHAUSTED",
    "USER_CANCELLED",
]);
function latestTransition(aggregate, predicate) {
    return [...aggregate.transitions].reverse().find(predicate);
}
function latestReceiptRef(aggregate, events) {
    return latestTransition(aggregate, (transition) => events.has(transition.event))?.receiptRef;
}
export function buildCanonicalTransitionObservabilityEvent(input) {
    const transition = input.aggregate.transitions.at(-1);
    if (!transition)
        return { status: "skipped" };
    const base = {
        requestId: input.context.requestId,
        requestGroupId: input.context.requestGroupId,
        rootRunId: input.context.rootRunId,
        runId: input.context.runId,
        ...(input.context.parentRunId ? { parentRunId: input.context.parentRunId } : {}),
        workId: input.aggregate.workId,
    };
    const common = {
        eventId: `typed-observability:${input.aggregate.workId}:${transition.revision}`,
        at: input.context.at,
    };
    const executionReceipt = latestReceiptRef(input.aggregate, new Set(["EXECUTION_STARTED"]));
    const evidenceReceipt = latestReceiptRef(input.aggregate, new Set(["ATTEMPT_RECORDED"]));
    const reviewReceipt = latestReceiptRef(input.aggregate, REVIEW_EVENTS);
    const candidate = (() => {
        switch (transition.event) {
            case "DIAGNOSIS_ACCEPTED":
                return {
                    ...common,
                    kind: "analysis_completed",
                    purpose: "product",
                    correlation: base,
                    reasonCode: "diagnosis_accepted",
                    summary: "Solution analysis completed",
                };
            case "EXECUTION_STARTED":
                return {
                    ...common,
                    kind: "execution_started",
                    purpose: "field_debug",
                    correlation: { ...base, attemptId: transition.receiptRef },
                    reasonCode: "execution_started",
                    summary: "Execution attempt started",
                };
            case "ATTEMPT_RECORDED":
                if (!executionReceipt)
                    return null;
                return {
                    ...common,
                    kind: "evidence_recorded",
                    purpose: "field_debug",
                    correlation: { ...base, attemptId: executionReceipt, evidenceId: transition.receiptRef },
                    reasonCode: "attempt_evidence_recorded",
                    summary: "Execution evidence recorded",
                };
            case "ALL_CRITERIA_VERIFIED":
            case "SOME_CRITERIA_VERIFIED":
            case "POLICY_BLOCKED":
            case "PATHS_EXHAUSTED":
            case "USER_CANCELLED":
                return {
                    ...common,
                    kind: "review_completed",
                    purpose: "product",
                    correlation: {
                        ...base,
                        reviewId: transition.receiptRef,
                        ...(evidenceReceipt ? { evidenceId: evidenceReceipt } : {}),
                    },
                    reasonCode: transition.event.toLowerCase(),
                    summary: "Canonical result review completed",
                };
            case "RECOVERY_ACCEPTED":
                if (!executionReceipt)
                    return null;
                return {
                    ...common,
                    kind: "recovery_completed",
                    purpose: "field_debug",
                    correlation: {
                        ...base,
                        attemptId: executionReceipt,
                        recoveryId: transition.receiptRef,
                    },
                    reasonCode: "recovery_accepted",
                    summary: "Recovery decision accepted",
                };
            case "REPORT_DELIVERED":
                if (!reviewReceipt)
                    return null;
                return {
                    ...common,
                    kind: "finalization_completed",
                    purpose: "product",
                    correlation: { ...base, reviewId: reviewReceipt },
                    reasonCode: "report_delivered",
                    summary: "User report delivery completed",
                };
            default:
                return undefined;
        }
    })();
    if (candidate === undefined)
        return { status: "skipped" };
    if (candidate === null)
        return { status: "rejected", reasonCode: "canonical_observability_reference_missing" };
    const built = buildTypedObservabilityEvent(candidate);
    return built.status === "ready"
        ? built
        : { status: "rejected", reasonCode: built.reasonCode };
}
export function recordCanonicalTransitionObservability(input) {
    const built = buildCanonicalTransitionObservabilityEvent(input);
    if (built.status !== "ready")
        return built;
    return recordTypedObservabilityEventSafely({
        repository: input.repository,
        event: built.event,
        ...(input.onDegraded ? { onDegraded: input.onDegraded } : {}),
    });
}
//# sourceMappingURL=canonical-transition-events.js.map