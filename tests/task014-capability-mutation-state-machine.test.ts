import { describe, expect, it } from "vitest"
import {
  executeCapabilityMutation,
  projectCapabilityMutationLog,
  transitionCapabilityMutation,
  projectCapabilityMutationReceipt,
  type CapabilityMutation,
} from "../packages/webui/src/lib/capability-mutation-state-machine.js"

const draft = (): CapabilityMutation => ({ mutationId: "m-1", state: "draft", baseRevision: 3, targetRevision: 4, reasonCode: null })

describe("task014 capability mutation state machine", () => {
  it("reaches active only after persist, apply, and health verification", () => {
    let state = transitionCapabilityMutation(draft(), { type: "validate" })
    state = transitionCapabilityMutation(state, { type: "validation_passed" })
    state = transitionCapabilityMutation(state, { type: "persist", expectedRevision: 3, actualRevision: 3 })
    state = transitionCapabilityMutation(state, { type: "persisted" })
    state = transitionCapabilityMutation(state, { type: "applied" })
    expect(state.state).toBe("verifying")
    expect(() => transitionCapabilityMutation({ ...state, state: "applying" }, { type: "verified" })).toThrow("Invalid capability transition")
    state = transitionCapabilityMutation(state, { type: "verified" })
    expect(state.state).toBe("active")
  })

  it("rejects stale revisions and exposes rollback only for recoverable failures", () => {
    const ready: CapabilityMutation = { ...draft(), state: "ready" }
    expect(() => transitionCapabilityMutation(ready, { type: "persist", expectedRevision: 3, actualRevision: 4 })).toThrow("Capability revision conflict")
    const failed = transitionCapabilityMutation({ ...draft(), state: "applying" }, { type: "apply_failed", reasonCode: "runtime_apply_failed" })
    expect(projectCapabilityMutationReceipt(failed).allowedActions).toContain("rollback")
    expect(transitionCapabilityMutation(failed, { type: "rollback" }).state).toBe("rolling_back")
  })

  it("projects no restricted implementation fields", () => {
    expect(projectCapabilityMutationReceipt(draft())).toEqual({
      mutationId: "m-1", targetRevision: 4, state: "draft", reasonCode: null,
      allowedActions: ["validate", "cancel"],
    })
  })

  it("executes ports in order and rolls back after verification failure", async () => {
    const calls: string[] = []
    const result = await executeCapabilityMutation(draft(), {
      validate: async () => { calls.push("validate"); return { ok: true } },
      persist: async () => { calls.push("persist"); return { revision: 4 } },
      apply: async () => { calls.push("apply"); return { ok: true } },
      verify: async () => { calls.push("verify"); return { ok: false, reasonCode: "health_failed" } },
      rollback: async () => { calls.push("rollback"); return { ok: true } },
    })
    expect(calls).toEqual(["validate", "persist", "apply", "verify", "rollback"])
    expect(result.state).toBe("rolled_back")
  })

  it("separates product, field-debug, and development log payloads", () => {
    expect(projectCapabilityMutationLog("product", draft())).toEqual({ level: "product", state: "draft", reasonCode: null })
    expect(projectCapabilityMutationLog("field_debug", draft())).toMatchObject({ mutationId: "m-1", targetRevision: 4 })
    expect(projectCapabilityMutationLog("development", draft())).toMatchObject({ baseRevision: 3, allowedActions: ["validate", "cancel"] })
  })
})
