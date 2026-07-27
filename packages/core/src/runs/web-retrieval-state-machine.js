export function createWebRetrievalMachine() {
    return Object.freeze({
        state: "DIAGNOSED",
        attemptFingerprints: Object.freeze([]),
        lastFailureReasonCode: null,
    });
}
const TERMINAL = new Set(["COMPLETED", "BLOCKED", "CANCELLED"]);
export function transitionWebRetrieval(machine, event) {
    if (TERMINAL.has(machine.state)) {
        return { ok: false, reasonCode: "web_retrieval_terminal_state" };
    }
    if (event.type === "cancelled") {
        return { ok: true, value: { ...machine, state: "CANCELLED" } };
    }
    if (event.type === "blocked") {
        return {
            ok: true,
            value: { ...machine, state: "BLOCKED", lastFailureReasonCode: event.reasonCode },
        };
    }
    if (event.type === "search_failed" || event.type === "fetch_failed" || event.type === "verification_failed") {
        return {
            ok: true,
            value: {
                ...machine,
                state: "REDIAGNOSING",
                lastFailureReasonCode: event.reasonCode,
            },
        };
    }
    if (event.type === "search_planned" || event.type === "fetch_planned") {
        if (machine.attemptFingerprints.includes(event.attemptFingerprint)) {
            return { ok: false, reasonCode: "web_retrieval_attempt_duplicate" };
        }
        const allowed = machine.state === "DIAGNOSED" || machine.state === "REDIAGNOSING" ||
            (event.type === "fetch_planned" &&
                (machine.state === "CANDIDATES_READY" || machine.state === "EVIDENCE_READY"));
        if (!allowed)
            return { ok: false, reasonCode: "web_retrieval_transition_invalid" };
        return {
            ok: true,
            value: {
                state: event.type === "search_planned" ? "SEARCH_PLANNED" : "FETCH_PLANNED",
                attemptFingerprints: Object.freeze([
                    ...machine.attemptFingerprints,
                    event.attemptFingerprint,
                ]),
                lastFailureReasonCode: machine.lastFailureReasonCode,
            },
        };
    }
    if (event.type === "verification_started" &&
        (machine.state === "CANDIDATES_READY" || machine.state === "EVIDENCE_READY")) {
        return { ok: true, value: { ...machine, state: "VERIFYING" } };
    }
    const transitions = {
        search_started: ["SEARCH_PLANNED", "SEARCHING"],
        search_succeeded: ["SEARCHING", "CANDIDATES_READY"],
        fetch_started: ["FETCH_PLANNED", "FETCHING"],
        fetch_succeeded: ["FETCHING", "EVIDENCE_READY"],
        verification_completed: ["VERIFYING", "COMPLETED"],
    };
    const transition = transitions[event.type];
    if (!transition || machine.state !== transition[0]) {
        return { ok: false, reasonCode: "web_retrieval_transition_invalid" };
    }
    return { ok: true, value: { ...machine, state: transition[1] } };
}
//# sourceMappingURL=web-retrieval-state-machine.js.map