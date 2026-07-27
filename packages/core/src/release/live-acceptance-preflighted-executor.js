import { resolveLiveAcceptanceExecutionSelections, } from "./live-acceptance-selection-preflight.js";
function stopped(status, reasonCode, validating = false) {
    return Object.freeze({
        status,
        blockers: Object.freeze([{ capability: "collection", reasonCode }]),
        events: Object.freeze([
            { state: "initialized" },
            ...(validating ? [{ state: "validating" }] : []),
            { state: status === "cancelled" ? "cancelled" : "blocked" },
        ]),
    });
}
function freezeApproval(approval) {
    const roles = [...approval.roles];
    Object.freeze(roles);
    return Object.freeze({ ...approval, roles });
}
export function createPreflightedLiveAcceptanceExecutor(input) {
    return async (request) => {
        const signal = request.signal;
        if (signal.aborted)
            return stopped("cancelled", "live_collection_cancelled");
        const observedAt = input.now();
        let snapshot;
        try {
            snapshot = input.captureSnapshot(observedAt);
        }
        catch {
            return stopped("blocked", "live_preflight_capture_failed");
        }
        if (signal.aborted)
            return stopped("cancelled", "live_collection_cancelled");
        const preflight = resolveLiveAcceptanceExecutionSelections({
            selection: request.selection,
            snapshot,
            now: observedAt,
            maxYeonjangAgeMs: input.maxYeonjangAgeMs,
        });
        if (preflight.status === "rejected") {
            return stopped("blocked", preflight.reasonCode, true);
        }
        if (signal.aborted)
            return stopped("cancelled", "live_collection_cancelled", true);
        const context = Object.freeze({
            candidate: Object.freeze({ ...request.candidate }),
            approval: freezeApproval(request.approval),
            requestedKeyId: request.requestedKeyId,
            observedAt,
            signal,
            preflight,
        });
        try {
            return await input.executeVerified(context);
        }
        catch {
            return stopped("blocked", "live_verified_execution_failed", true);
        }
    };
}
//# sourceMappingURL=live-acceptance-preflighted-executor.js.map