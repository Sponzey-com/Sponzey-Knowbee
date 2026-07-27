export const YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS = Object.freeze([
    "node.capabilities",
    "system.info",
    "camera.list",
    "file.metadata",
    "file.list",
    "file.read",
    "file.search",
    "disk.info",
    "disk.usage",
    "disk.exists",
    "clipboard.read",
    "network.status",
    "device.status",
]);
export function isYeonjangLiveSmokeReadOnlyMethod(value) {
    return (typeof value === "string" &&
        YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS.includes(value));
}
const TRANSITIONS = {
    prepared: { DISPATCH: "dispatched", REJECT: "rejected" },
    dispatched: { ACK: "acknowledged", REJECT: "rejected" },
    acknowledged: { OBSERVE: "observed", REJECT: "rejected" },
    observed: { VERIFY: "verified", REJECT: "rejected" },
};
export function transitionYeonjangLiveSmokeState(state, event) {
    const next = TRANSITIONS[state]?.[event];
    return next
        ? { ok: true, state: next }
        : { ok: false, state, reasonCode: "yeonjang_smoke_transition_invalid" };
}
//# sourceMappingURL=yeonjang-live-smoke.js.map