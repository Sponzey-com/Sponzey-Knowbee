import { applyCanonicalWorkEvent, } from "../contracts/canonical-work-aggregate.js";
import { projectCanonicalWorkStateToRunStatus, } from "./canonical-work-run-projection.js";
export function executeCanonicalWorkTransition(input) {
    const current = input.repository.load(input.input.workId);
    if (!current)
        return { status: "rejected", reasonCode: "aggregate_not_found" };
    if (current.workId !== input.input.workId) {
        return { status: "rejected", reasonCode: "aggregate_identity_mismatch" };
    }
    const transition = applyCanonicalWorkEvent({
        aggregate: current,
        expectedRevision: input.input.expectedRevision,
        event: input.input.event,
        receiptRef: input.input.receiptRef,
    });
    if (!transition.applied) {
        return {
            status: "rejected",
            reasonCode: transition.reasonCode,
            ...(transition.reasonCode === "stale_revision"
                ? { currentRevision: transition.currentRevision }
                : {}),
        };
    }
    const projection = projectCanonicalWorkStateToRunStatus({
        state: transition.aggregate.state,
        ...(input.input.waitingKind ? { waitingKind: input.input.waitingKind } : {}),
        ...(input.input.finalOutcome ? { finalOutcome: input.input.finalOutcome } : {}),
    });
    if (!projection.ok)
        return { status: "rejected", reasonCode: projection.reasonCode };
    const saved = input.repository.save({
        aggregate: transition.aggregate,
        expectedRevision: input.input.expectedRevision,
    });
    if (!saved.saved) {
        return { status: "conflict", reasonCode: saved.reasonCode, currentRevision: saved.currentRevision };
    }
    return {
        status: "applied",
        aggregate: transition.aggregate,
        runProjection: projection.projection,
    };
}
//# sourceMappingURL=canonical-work-transition-use-case.js.map