import { transitionCanonicalWorkState, } from "./canonical-work-state.js";
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function revision(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer.`);
    return value;
}
export function canonicalWorkIdForRootRun(rootRunId) {
    return `work:root:${required(rootRunId, "Root run ID")}`;
}
export function createCanonicalWorkAggregate(input) {
    return {
        workId: required(input.workId, "Work ID"),
        rootRunId: required(input.rootRunId, "Root run ID"),
        state: "REQUEST_RECEIVED",
        revision: 0,
        transitions: [],
    };
}
export function applyCanonicalWorkEvent(input) {
    const expectedRevision = revision(input.expectedRevision, "Expected revision");
    if (expectedRevision !== input.aggregate.revision) {
        return { applied: false, reasonCode: "stale_revision", currentRevision: input.aggregate.revision };
    }
    const transition = transitionCanonicalWorkState({
        currentState: input.aggregate.state,
        event: input.event,
        receiptRef: input.receiptRef,
    });
    if (!transition.accepted)
        return { applied: false, reasonCode: transition.reasonCode };
    const receipt = {
        revision: input.aggregate.revision + 1,
        event: transition.event,
        previousState: transition.previousState,
        nextState: transition.nextState,
        receiptRef: transition.receiptRef,
    };
    return {
        applied: true,
        receipt,
        aggregate: {
            ...input.aggregate,
            state: transition.nextState,
            revision: receipt.revision,
            transitions: [...input.aggregate.transitions, receipt],
        },
    };
}
//# sourceMappingURL=canonical-work-aggregate.js.map