export declare const MCP_COMPONENT_STATES: readonly ["pending", "connecting", "ready", "degraded", "failed", "cancelled"];
export type McpComponentState = typeof MCP_COMPONENT_STATES[number];
export declare const MCP_COMPONENT_EVENTS: readonly ["connect_requested", "connection_ready", "connection_degraded", "connection_failed", "retry_requested", "cancel_requested"];
export type McpComponentEvent = typeof MCP_COMPONENT_EVENTS[number];
export type McpComponentTransitionResult = {
    readonly status: "accepted";
    readonly previousState: McpComponentState;
    readonly event: McpComponentEvent;
    readonly nextState: McpComponentState;
} | {
    readonly status: "rejected";
    readonly reasonCode: "transition_not_allowed" | "terminal_state_exit_forbidden";
};
export declare function transitionMcpComponentState(currentState: McpComponentState, event: McpComponentEvent): McpComponentTransitionResult;
//# sourceMappingURL=mcp-component-state.d.ts.map