import { describe, expect, it } from "vitest"
import {
  initialYeonjangRecoveryFlow,
  reduceYeonjangRecoveryFlow,
} from "../packages/core/src/capabilities/yeonjang-recovery-flow.js"

describe("task035 Yeonjang recovery flow", () => {
  it("requires confirmation and explicit post-execution verification", () => {
    let flow = reduceYeonjangRecoveryFlow(initialYeonjangRecoveryFlow, {
      type: "request",
      action: "reconnect",
    })
    expect(flow.state).toBe("confirming")
    flow = reduceYeonjangRecoveryFlow(flow, { type: "confirm" })
    expect(flow.state).toBe("executing")
    flow = reduceYeonjangRecoveryFlow(flow, { type: "execution_completed" })
    expect(flow.state).toBe("verifying")
    flow = reduceYeonjangRecoveryFlow(flow, { type: "verification_succeeded" })
    expect(flow).toMatchObject({ state: "active", action: "reconnect", reasonCode: null })
  })

  it("keeps failed and blocked outcomes retryable without boolean flags", () => {
    const confirming = reduceYeonjangRecoveryFlow(initialYeonjangRecoveryFlow, {
      type: "request",
      action: "check_permissions",
    })
    const executing = reduceYeonjangRecoveryFlow(confirming, { type: "confirm" })
    const blocked = reduceYeonjangRecoveryFlow(executing, {
      type: "blocked",
      reasonCode: "os_interaction_required",
    })
    expect(blocked).toMatchObject({ state: "blocked", reasonCode: "os_interaction_required" })
    expect(reduceYeonjangRecoveryFlow(blocked, { type: "retry" })).toMatchObject({
      state: "confirming",
      reasonCode: null,
    })
    expect(() =>
      reduceYeonjangRecoveryFlow(initialYeonjangRecoveryFlow, { type: "confirm" }),
    ).toThrow("Invalid Yeonjang recovery transition")
  })
})
