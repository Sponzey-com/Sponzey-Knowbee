export const MCP_COMPONENT_STATES = [
  "pending",
  "connecting",
  "ready",
  "degraded",
  "failed",
  "cancelled",
] as const

export type McpComponentState = typeof MCP_COMPONENT_STATES[number]

export const MCP_COMPONENT_EVENTS = [
  "connect_requested",
  "connection_ready",
  "connection_degraded",
  "connection_failed",
  "retry_requested",
  "cancel_requested",
] as const

export type McpComponentEvent = typeof MCP_COMPONENT_EVENTS[number]

export type McpComponentTransitionResult =
  | {
    readonly status: "accepted"
    readonly previousState: McpComponentState
    readonly event: McpComponentEvent
    readonly nextState: McpComponentState
  }
  | {
    readonly status: "rejected"
    readonly reasonCode:
      | "transition_not_allowed"
      | "terminal_state_exit_forbidden"
  }

const TRANSITIONS: Readonly<
  Record<
    McpComponentState,
    Readonly<Partial<Record<McpComponentEvent, McpComponentState>>>
  >
> = {
  pending: {
    connect_requested: "connecting",
    cancel_requested: "cancelled",
  },
  connecting: {
    connection_ready: "ready",
    connection_failed: "failed",
    cancel_requested: "cancelled",
  },
  ready: {
    connection_degraded: "degraded",
    cancel_requested: "cancelled",
  },
  degraded: {
    retry_requested: "connecting",
    connection_failed: "failed",
    cancel_requested: "cancelled",
  },
  failed: {
    retry_requested: "connecting",
    cancel_requested: "cancelled",
  },
  cancelled: {},
}

export function transitionMcpComponentState(
  currentState: McpComponentState,
  event: McpComponentEvent,
): McpComponentTransitionResult {
  if (currentState === "cancelled") {
    return { status: "rejected", reasonCode: "terminal_state_exit_forbidden" }
  }
  const nextState = TRANSITIONS[currentState][event]
  return nextState
    ? { status: "accepted", previousState: currentState, event, nextState }
    : { status: "rejected", reasonCode: "transition_not_allowed" }
}
