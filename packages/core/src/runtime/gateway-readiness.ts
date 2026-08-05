import {
  createGatewayStartup,
  transitionGatewayStartup,
  type GatewayStartupEvent,
  type GatewayStartupSnapshot,
  type GatewayStartupTransitionRejectionReason,
} from "../contracts/gateway-startup-state.js"

export type GatewayReadinessStatus = "starting" | "ready" | "failed"

export interface GatewayReadinessSnapshot {
  readonly status: GatewayReadinessStatus
  readonly changedAt: string
  readonly reasonCode: string | null
}

export type GatewayReadinessTransitionResult =
  | {
    readonly status: "accepted"
    readonly readiness: GatewayReadinessSnapshot
    readonly startup: GatewayStartupSnapshot
  }
  | {
    readonly status: "rejected"
    readonly reasonCode: GatewayStartupTransitionRejectionReason
    readonly readiness: GatewayReadinessSnapshot
  }

function projectReadiness(snapshot: GatewayStartupSnapshot): GatewayReadinessSnapshot {
  const status: GatewayReadinessStatus =
    snapshot.state === "ready"
      ? "ready"
      : snapshot.state === "failed" || snapshot.state === "cancelled"
        ? "failed"
        : "starting"
  return Object.freeze({
    status,
    changedAt: new Date(snapshot.changedAt).toISOString(),
    reasonCode:
      status === "ready"
        ? null
        : snapshot.reasonCode ?? (status === "starting" ? "bootstrap_pending" : "startup_failed"),
  })
}

function createInitialStartup(
  input: { startupId: string; pid: number; startedAt: number },
): GatewayStartupSnapshot {
  const created = createGatewayStartup(input)
  if (created.status === "rejected") throw new Error(created.reasonCode)
  const loading = transitionGatewayStartup(created.snapshot, {
    type: "load_runtime",
    at: input.startedAt,
  })
  if (loading.status === "rejected") throw new Error(loading.reasonCode)
  return loading.snapshot
}

const initialStartedAt = Date.now()
let currentStartup = createInitialStartup({
  startupId: `gateway-${process.pid}-${initialStartedAt}`,
  pid: process.pid,
  startedAt: initialStartedAt,
})

export function beginGatewayStartup(input: {
  readonly startupId: string
  readonly pid: number
  readonly startedAt: number
}): GatewayReadinessTransitionResult {
  const created = createGatewayStartup(input)
  if (created.status === "rejected") {
    return {
      status: "rejected",
      reasonCode: created.reasonCode === "timestamp_invalid"
        ? "timestamp_invalid"
        : "transition_not_allowed",
      readiness: projectReadiness(currentStartup),
    }
  }
  const loading = transitionGatewayStartup(created.snapshot, {
    type: "load_runtime",
    at: input.startedAt,
  })
  if (loading.status === "rejected") {
    return {
      ...loading,
      readiness: projectReadiness(currentStartup),
    }
  }
  currentStartup = loading.snapshot
  return {
    status: "accepted",
    readiness: projectReadiness(currentStartup),
    startup: currentStartup,
  }
}

export function markGatewayStarting(): GatewayReadinessSnapshot {
  const startedAt = Date.now()
  const result = beginGatewayStartup({
    startupId: `gateway-${process.pid}-${startedAt}`,
    pid: process.pid,
    startedAt,
  })
  return result.readiness
}

export function transitionGatewayReadiness(
  event: GatewayStartupEvent,
): GatewayReadinessTransitionResult {
  const result = transitionGatewayStartup(currentStartup, event)
  if (result.status === "rejected") {
    return { ...result, readiness: projectReadiness(currentStartup) }
  }
  currentStartup = result.snapshot
  return {
    status: "accepted",
    readiness: projectReadiness(currentStartup),
    startup: currentStartup,
  }
}

export function markGatewayReady(): GatewayReadinessTransitionResult {
  const remainingEvents = [
    "runtime_loaded",
    "core_initialized",
    "channels_activated",
    "http_bound",
    "plugins_loaded",
  ] as const
  let lastResult: GatewayReadinessTransitionResult = {
    status: "accepted",
    readiness: projectReadiness(currentStartup),
    startup: currentStartup,
  }
  for (const type of remainingEvents) {
    if (currentStartup.state === "ready") break
    lastResult = transitionGatewayReadiness({ type, at: Date.now() })
    if (lastResult.status === "rejected") return lastResult
  }
  return lastResult
}

export function markGatewayFailed(reasonCode: string): GatewayReadinessTransitionResult {
  return transitionGatewayReadiness({ type: "fail", at: Date.now(), reasonCode })
}

export function getGatewayReadinessSnapshot(): GatewayReadinessSnapshot {
  return projectReadiness(currentStartup)
}

export function getGatewayStartupSnapshot(): GatewayStartupSnapshot {
  return currentStartup
}
