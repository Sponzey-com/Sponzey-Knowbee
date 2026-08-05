import { describe, expect, it } from "vitest"
import {
  initialYeonjangBindingFlow,
  initialYeonjangRecoveryFlow,
  reduceYeonjangBindingFlow,
  reduceYeonjangRecoveryFlow,
} from "../packages/webui/src/lib/yeonjang-detail-flow.js"

describe("task035 Yeonjang detail flow", () => {
  it("requires recovery confirmation and keeps failure retryable", () => {
    const confirming = reduceYeonjangRecoveryFlow(initialYeonjangRecoveryFlow, {
      type: "request",
      action: "check_permissions",
    })
    const executing = reduceYeonjangRecoveryFlow(confirming, { type: "confirm" })
    const failed = reduceYeonjangRecoveryFlow(executing, {
      type: "failed",
      reasonCode: "os_interaction_required",
      blocked: true,
    })
    expect(failed).toMatchObject({ state: "blocked", reasonCode: "os_interaction_required" })
    expect(reduceYeonjangRecoveryFlow(failed, { type: "confirm" }).state).toBe("executing")
  })

  it("tracks binding edits without mutating the server snapshot", () => {
    const initial = initialYeonjangBindingFlow(["agent:a"])
    const editing = reduceYeonjangBindingFlow(initial, {
      type: "edit",
      selectedAgentRefs: ["agent:a"],
    })
    const toggled = reduceYeonjangBindingFlow(editing, { type: "toggle", agentRef: "agent:b" })
    expect(toggled.selectedAgentRefs).toEqual(["agent:a", "agent:b"])
    expect(initial.selectedAgentRefs).toEqual(["agent:a"])
    const saving = reduceYeonjangBindingFlow(toggled, { type: "save" })
    expect(
      reduceYeonjangBindingFlow(saving, {
        type: "failed",
        reasonCode: "mutation_revision_conflict",
      }),
    ).toMatchObject({ state: "failed", reasonCode: "mutation_revision_conflict" })
  })
})
