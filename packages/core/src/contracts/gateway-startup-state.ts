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
] as const

export type GatewayStartupState = typeof GATEWAY_STARTUP_STATES[number]

export type GatewayStartupEvent =
  | { readonly type: "load_runtime"; readonly at: number }
  | { readonly type: "runtime_loaded"; readonly at: number }
  | { readonly type: "core_initialized"; readonly at: number }
  | { readonly type: "channels_activated"; readonly at: number }
  | { readonly type: "http_bound"; readonly at: number }
  | { readonly type: "plugins_loaded"; readonly at: number }
  | { readonly type: "fail"; readonly at: number; readonly reasonCode: string }
  | { readonly type: "cancel"; readonly at: number; readonly reasonCode: string }

export interface GatewayStartupSnapshot {
  readonly startupId: string
  readonly pid: number
  readonly state: GatewayStartupState
  readonly startedAt: number
  readonly changedAt: number
  readonly reasonCode: string | null
}

export type CreateGatewayStartupResult =
  | { readonly status: "accepted"; readonly snapshot: GatewayStartupSnapshot }
  | {
    readonly status: "rejected"
    readonly reasonCode: "startup_id_required" | "pid_invalid" | "timestamp_invalid"
  }

export type GatewayStartupTransitionRejectionReason =
  | "transition_not_allowed"
  | "terminal_state_exit_forbidden"
  | "timestamp_invalid"
  | "reason_code_required"

export type GatewayStartupTransitionResult =
  | { readonly status: "accepted"; readonly snapshot: GatewayStartupSnapshot }
  | {
    readonly status: "rejected"
    readonly reasonCode: GatewayStartupTransitionRejectionReason
  }

export type GatewayStartupObservation =
  | {
    readonly status: "still_starting"
    readonly elapsedMs: number
    readonly performance: "within_budget" | "budget_exceeded"
  }
  | { readonly status: "ready"; readonly elapsedMs: number }
  | { readonly status: "failed"; readonly elapsedMs: number; readonly reasonCode: string }
  | { readonly status: "cancelled"; readonly elapsedMs: number; readonly reasonCode: string }

export interface ObserveGatewayStartupInput {
  readonly snapshot: GatewayStartupSnapshot
  readonly processState: "running" | "exited"
  readonly observedAt: number
  readonly performanceBudgetMs: number
}

type ProgressGatewayStartupEvent = Exclude<
  GatewayStartupEvent["type"],
  "fail" | "cancel"
>

const NEXT_STATE_BY_EVENT: Readonly<
  Record<
    GatewayStartupState,
    Readonly<Partial<Record<ProgressGatewayStartupEvent, GatewayStartupState>>>
  >
> = {
  created: { load_runtime: "loading_runtime" },
  loading_runtime: { runtime_loaded: "initializing_core" },
  initializing_core: { core_initialized: "activating_channels" },
  activating_channels: { channels_activated: "binding_http" },
  binding_http: { http_bound: "loading_plugins" },
  loading_plugins: { plugins_loaded: "ready" },
  ready: {},
  failed: {},
  cancelled: {},
}

const TERMINAL_STATES = new Set<GatewayStartupState>(["ready", "failed", "cancelled"])

function immutableSnapshot(input: GatewayStartupSnapshot): GatewayStartupSnapshot {
  return Object.freeze({ ...input })
}

function elapsed(snapshot: GatewayStartupSnapshot, observedAt: number): number {
  return Math.max(0, observedAt - snapshot.startedAt)
}

export function createGatewayStartup(input: {
  readonly startupId: string
  readonly pid: number
  readonly startedAt: number
}): CreateGatewayStartupResult {
  if (!input.startupId.trim()) {
    return { status: "rejected", reasonCode: "startup_id_required" }
  }
  if (!Number.isSafeInteger(input.pid) || input.pid <= 0) {
    return { status: "rejected", reasonCode: "pid_invalid" }
  }
  if (!Number.isFinite(input.startedAt) || input.startedAt < 0) {
    return { status: "rejected", reasonCode: "timestamp_invalid" }
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
  }
}

export function transitionGatewayStartup(
  snapshot: GatewayStartupSnapshot,
  event: GatewayStartupEvent,
): GatewayStartupTransitionResult {
  if (!Number.isFinite(event.at) || event.at < snapshot.changedAt) {
    return { status: "rejected", reasonCode: "timestamp_invalid" }
  }
  if (TERMINAL_STATES.has(snapshot.state)) {
    return { status: "rejected", reasonCode: "terminal_state_exit_forbidden" }
  }
  if (event.type === "fail" || event.type === "cancel") {
    if (!event.reasonCode.trim()) {
      return { status: "rejected", reasonCode: "reason_code_required" }
    }
    return {
      status: "accepted",
      snapshot: immutableSnapshot({
        ...snapshot,
        state: event.type === "fail" ? "failed" : "cancelled",
        changedAt: event.at,
        reasonCode: event.reasonCode,
      }),
    }
  }
  const nextState = NEXT_STATE_BY_EVENT[snapshot.state][event.type]
  if (!nextState) {
    return { status: "rejected", reasonCode: "transition_not_allowed" }
  }
  return {
    status: "accepted",
    snapshot: immutableSnapshot({
      ...snapshot,
      state: nextState,
      changedAt: event.at,
      reasonCode: null,
    }),
  }
}

export function observeGatewayStartup(
  input: ObserveGatewayStartupInput,
): GatewayStartupObservation {
  const elapsedMs = elapsed(input.snapshot, input.observedAt)
  if (input.snapshot.state === "failed") {
    return {
      status: "failed",
      elapsedMs,
      reasonCode: input.snapshot.reasonCode ?? "startup_failed",
    }
  }
  if (input.snapshot.state === "cancelled") {
    return {
      status: "cancelled",
      elapsedMs,
      reasonCode: input.snapshot.reasonCode ?? "startup_cancelled",
    }
  }
  if (input.processState === "exited") {
    return { status: "failed", elapsedMs, reasonCode: "process_exited" }
  }
  if (input.snapshot.state === "ready") {
    return { status: "ready", elapsedMs }
  }
  return {
    status: "still_starting",
    elapsedMs,
    performance:
      elapsedMs > input.performanceBudgetMs ? "budget_exceeded" : "within_budget",
  }
}
