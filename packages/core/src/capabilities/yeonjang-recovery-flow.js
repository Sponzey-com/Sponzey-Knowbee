export const initialYeonjangRecoveryFlow = Object.freeze({
    state: "idle",
    action: null,
    reasonCode: null,
});
export function reduceYeonjangRecoveryFlow(current, event) {
    if (event.type === "cancel" && current.state === "confirming")
        return initialYeonjangRecoveryFlow;
    if (current.state === "idle" && event.type === "request")
        return { state: "confirming", action: event.action, reasonCode: null };
    if (current.state === "confirming" && event.type === "confirm")
        return { ...current, state: "executing" };
    if (current.state === "executing" && event.type === "execution_completed")
        return { ...current, state: "verifying" };
    if (current.state === "verifying" && event.type === "verification_succeeded")
        return { ...current, state: "active", reasonCode: null };
    if ((current.state === "executing" || current.state === "verifying") &&
        event.type === "verification_failed")
        return { ...current, state: "failed", reasonCode: event.reasonCode };
    if (["confirming", "executing", "verifying"].includes(current.state) && event.type === "blocked")
        return { ...current, state: "blocked", reasonCode: event.reasonCode };
    if ((current.state === "failed" || current.state === "blocked") && event.type === "retry")
        return { ...current, state: "confirming", reasonCode: null };
    throw new Error(`Invalid Yeonjang recovery transition: ${current.state} -> ${event.type}`);
}
//# sourceMappingURL=yeonjang-recovery-flow.js.map