import { describe, expect, it } from "vitest"
import {
  createGatewayStartup,
  observeGatewayStartup,
  transitionGatewayStartup,
  type GatewayStartupSnapshot,
} from "../packages/core/src/contracts/gateway-startup-state.ts"

function startup(): GatewayStartupSnapshot {
  const result = createGatewayStartup({
    startupId: "startup-001",
    pid: 4100,
    startedAt: 1_000,
  })
  if (result.status !== "accepted") throw new Error("fixture startup was rejected")
  return result.snapshot
}

function readyStartup(): GatewayStartupSnapshot {
  let current = startup()
  for (const type of [
    "load_runtime",
    "runtime_loaded",
    "core_initialized",
    "channels_activated",
    "http_bound",
    "plugins_loaded",
  ] as const) {
    const decision = transitionGatewayStartup(current, {
      type,
      at: current.changedAt + 1,
    })
    if (decision.status !== "accepted") throw new Error(decision.reasonCode)
    current = decision.snapshot
  }
  return current
}

describe("Gateway startup state contract", () => {
  it("accepts the canonical startup path and rejects skipped or terminal transitions", () => {
    let current = startup()
    const path = [
      ["load_runtime", "loading_runtime"],
      ["runtime_loaded", "initializing_core"],
      ["core_initialized", "activating_channels"],
      ["channels_activated", "binding_http"],
      ["http_bound", "loading_plugins"],
      ["plugins_loaded", "ready"],
    ] as const

    for (const [type, expectedState] of path) {
      const decision = transitionGatewayStartup(current, {
        type,
        at: current.changedAt + 1,
      })
      expect(decision.status).toBe("accepted")
      if (decision.status !== "accepted") throw new Error(decision.reasonCode)
      current = decision.snapshot
      expect(current.state).toBe(expectedState)
    }

    expect(transitionGatewayStartup(startup(), {
      type: "runtime_loaded",
      at: 1_001,
    })).toMatchObject({
      status: "rejected",
      reasonCode: "transition_not_allowed",
    })
    expect(transitionGatewayStartup(current, {
      type: "fail",
      at: current.changedAt + 1,
      reasonCode: "late_failure",
    })).toMatchObject({
      status: "rejected",
      reasonCode: "terminal_state_exit_forbidden",
    })
  })

  it("treats failure and user cancellation as explicit terminal transitions", () => {
    const loading = transitionGatewayStartup(startup(), {
      type: "load_runtime",
      at: 1_001,
    })
    if (loading.status !== "accepted") throw new Error(loading.reasonCode)

    expect(transitionGatewayStartup(loading.snapshot, {
      type: "fail",
      at: 1_002,
      reasonCode: "core_initialization_failed",
    })).toMatchObject({
      status: "accepted",
      snapshot: {
        state: "failed",
        reasonCode: "core_initialization_failed",
      },
    })
    expect(transitionGatewayStartup(loading.snapshot, {
      type: "cancel",
      at: 1_002,
      reasonCode: "user_cancelled",
    })).toMatchObject({
      status: "accepted",
      snapshot: {
        state: "cancelled",
        reasonCode: "user_cancelled",
      },
    })
  })

  it("reports a running 120-second startup as still starting, not failed", () => {
    const observation = observeGatewayStartup({
      snapshot: startup(),
      processState: "running",
      observedAt: 121_000,
      performanceBudgetMs: 30_000,
    })

    expect(observation).toEqual({
      status: "still_starting",
      elapsedMs: 120_000,
      performance: "budget_exceeded",
    })
  })

  it("distinguishes ready, explicit failure, cancellation, and process exit", () => {
    const base = startup()
    const ready = readyStartup()
    const failed = transitionGatewayStartup(base, {
      type: "fail",
      at: 1_010,
      reasonCode: "binding_failed",
    })
    const cancelled = transitionGatewayStartup(base, {
      type: "cancel",
      at: 1_010,
      reasonCode: "user_cancelled",
    })
    if (failed.status !== "accepted" || cancelled.status !== "accepted") {
      throw new Error("terminal fixture transition was rejected")
    }

    expect(observeGatewayStartup({
      snapshot: ready,
      processState: "running",
      observedAt: 1_020,
      performanceBudgetMs: 30_000,
    })).toMatchObject({ status: "ready" })
    expect(observeGatewayStartup({
      snapshot: failed.snapshot,
      processState: "running",
      observedAt: 1_020,
      performanceBudgetMs: 30_000,
    })).toMatchObject({ status: "failed", reasonCode: "binding_failed" })
    expect(observeGatewayStartup({
      snapshot: cancelled.snapshot,
      processState: "running",
      observedAt: 1_020,
      performanceBudgetMs: 30_000,
    })).toMatchObject({ status: "cancelled", reasonCode: "user_cancelled" })
    expect(observeGatewayStartup({
      snapshot: base,
      processState: "exited",
      observedAt: 1_020,
      performanceBudgetMs: 30_000,
    })).toEqual({
      status: "failed",
      elapsedMs: 20,
      reasonCode: "process_exited",
    })
  })
})
