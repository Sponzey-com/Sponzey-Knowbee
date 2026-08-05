export const GATEWAY_STARTUP_STATES = [
    "created",
    "loading_runtime",
    "initializing_core",
    "activating_channels",
    "binding_http",
    "loading_plugins",
    "ready",
    "failed",
    "cancelled",
];
const NEXT_STATE_BY_EVENT = {
    created: { load_runtime: "loading_runtime" },
    loading_runtime: { runtime_loaded: "initializing_core" },
    initializing_core: { core_initialized: "activating_channels" },
    activating_channels: { channels_activated: "binding_http" },
    binding_http: { http_bound: "loading_plugins" },
    loading_plugins: { plugins_loaded: "ready" },
    ready: {},
    failed: {},
    cancelled: {},
};
const TERMINAL_STATES = new Set(["ready", "failed", "cancelled"]);
function immutableSnapshot(input) {
    return Object.freeze({ ...input });
}
function elapsed(snapshot, observedAt) {
    return Math.max(0, observedAt - snapshot.startedAt);
}
export function createGatewayStartup(input) {
    if (!input.startupId.trim()) {
        return { status: "rejected", reasonCode: "startup_id_required" };
    }
    if (!Number.isSafeInteger(input.pid) || input.pid <= 0) {
        return { status: "rejected", reasonCode: "pid_invalid" };
    }
    if (!Number.isFinite(input.startedAt) || input.startedAt < 0) {
        return { status: "rejected", reasonCode: "timestamp_invalid" };
    }
    return {
        status: "accepted",
        snapshot: immutableSnapshot({
            startupId: input.startupId,
            pid: input.pid,
            state: "created",
            startedAt: input.startedAt,
            changedAt: input.startedAt,
            reasonCode: null,
        }),
    };
}
export function transitionGatewayStartup(snapshot, event) {
    if (!Number.isFinite(event.at) || event.at < snapshot.changedAt) {
        return { status: "rejected", reasonCode: "timestamp_invalid" };
    }
    if (TERMINAL_STATES.has(snapshot.state)) {
        return { status: "rejected", reasonCode: "terminal_state_exit_forbidden" };
    }
    if (event.type === "fail" || event.type === "cancel") {
        if (!event.reasonCode.trim()) {
            return { status: "rejected", reasonCode: "reason_code_required" };
        }
        return {
            status: "accepted",
            snapshot: immutableSnapshot({
                ...snapshot,
                state: event.type === "fail" ? "failed" : "cancelled",
                changedAt: event.at,
                reasonCode: event.reasonCode,
            }),
        };
    }
    const nextState = NEXT_STATE_BY_EVENT[snapshot.state][event.type];
    if (!nextState) {
        return { status: "rejected", reasonCode: "transition_not_allowed" };
    }
    return {
        status: "accepted",
        snapshot: immutableSnapshot({
            ...snapshot,
            state: nextState,
            changedAt: event.at,
            reasonCode: null,
        }),
    };
}
export function observeGatewayStartup(input) {
    const elapsedMs = elapsed(input.snapshot, input.observedAt);
    if (input.snapshot.state === "failed") {
        return {
            status: "failed",
            elapsedMs,
            reasonCode: input.snapshot.reasonCode ?? "startup_failed",
        };
    }
    if (input.snapshot.state === "cancelled") {
        return {
            status: "cancelled",
            elapsedMs,
            reasonCode: input.snapshot.reasonCode ?? "startup_cancelled",
        };
    }
    if (input.processState === "exited") {
        return { status: "failed", elapsedMs, reasonCode: "process_exited" };
    }
    if (input.snapshot.state === "ready") {
        return { status: "ready", elapsedMs };
    }
    return {
        status: "still_starting",
        elapsedMs,
        performance: elapsedMs > input.performanceBudgetMs ? "budget_exceeded" : "within_budget",
    };
}
//# sourceMappingURL=gateway-startup-state.js.map