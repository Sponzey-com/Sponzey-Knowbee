export declare const GATEWAY_STARTUP_STATES: readonly ["created", "loading_runtime", "initializing_core", "activating_channels", "binding_http", "loading_plugins", "ready", "failed", "cancelled"];
export type GatewayStartupState = typeof GATEWAY_STARTUP_STATES[number];
export type GatewayStartupEvent = {
    readonly type: "load_runtime";
    readonly at: number;
} | {
    readonly type: "runtime_loaded";
    readonly at: number;
} | {
    readonly type: "core_initialized";
    readonly at: number;
} | {
    readonly type: "channels_activated";
    readonly at: number;
} | {
    readonly type: "http_bound";
    readonly at: number;
} | {
    readonly type: "plugins_loaded";
    readonly at: number;
} | {
    readonly type: "fail";
    readonly at: number;
    readonly reasonCode: string;
} | {
    readonly type: "cancel";
    readonly at: number;
    readonly reasonCode: string;
};
export interface GatewayStartupSnapshot {
    readonly startupId: string;
    readonly pid: number;
    readonly state: GatewayStartupState;
    readonly startedAt: number;
    readonly changedAt: number;
    readonly reasonCode: string | null;
}
export type CreateGatewayStartupResult = {
    readonly status: "accepted";
    readonly snapshot: GatewayStartupSnapshot;
} | {
    readonly status: "rejected";
    readonly reasonCode: "startup_id_required" | "pid_invalid" | "timestamp_invalid";
};
export type GatewayStartupTransitionRejectionReason = "transition_not_allowed" | "terminal_state_exit_forbidden" | "timestamp_invalid" | "reason_code_required";
export type GatewayStartupTransitionResult = {
    readonly status: "accepted";
    readonly snapshot: GatewayStartupSnapshot;
} | {
    readonly status: "rejected";
    readonly reasonCode: GatewayStartupTransitionRejectionReason;
};
export type GatewayStartupObservation = {
    readonly status: "still_starting";
    readonly elapsedMs: number;
    readonly performance: "within_budget" | "budget_exceeded";
} | {
    readonly status: "ready";
    readonly elapsedMs: number;
} | {
    readonly status: "failed";
    readonly elapsedMs: number;
    readonly reasonCode: string;
} | {
    readonly status: "cancelled";
    readonly elapsedMs: number;
    readonly reasonCode: string;
};
export interface ObserveGatewayStartupInput {
    readonly snapshot: GatewayStartupSnapshot;
    readonly processState: "running" | "exited";
    readonly observedAt: number;
    readonly performanceBudgetMs: number;
}
export declare function createGatewayStartup(input: {
    readonly startupId: string;
    readonly pid: number;
    readonly startedAt: number;
}): CreateGatewayStartupResult;
export declare function transitionGatewayStartup(snapshot: GatewayStartupSnapshot, event: GatewayStartupEvent): GatewayStartupTransitionResult;
export declare function observeGatewayStartup(input: ObserveGatewayStartupInput): GatewayStartupObservation;
//# sourceMappingURL=gateway-startup-state.d.ts.map