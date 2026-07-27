const TRANSITIONS = {
    prepared: { START: "executing", REJECT: "rejected" },
    executing: { OBSERVE: "observed", REJECT: "rejected" },
    observed: { VERIFY: "verified", REJECT: "rejected" },
};
export function transitionExtensionLiveSmokeState(state, event) {
    const next = state === "verified" || state === "rejected" ? undefined : TRANSITIONS[state][event];
    return next
        ? { ok: true, state: next }
        : { ok: false, state, reasonCode: "extension_smoke_transition_invalid" };
}
//# sourceMappingURL=extension-live-smoke.js.map