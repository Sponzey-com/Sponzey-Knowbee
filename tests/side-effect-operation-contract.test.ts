import { describe, expect, it } from "vitest"
import {
  buildSideEffectOperationIdentity,
  transitionSideEffectOperation,
} from "../packages/core/src/contracts/side-effect-operation.ts"

describe("side-effect operation contract", () => {
  it("builds a stable identity from scoped fingerprints without retaining raw params", () => {
    const identity = buildSideEffectOperationIdentity({
      runId: "run-1",
      workId: "work:root:run-1",
      stepKey: "executing",
      adapterId: "tool:file_write",
      targetFingerprint: `sha256:${"a".repeat(64)}`,
      paramsFingerprint: `sha256:${"b".repeat(64)}`,
    })
    expect(identity.operationId).toContain("run-1")
    expect(JSON.stringify(identity)).not.toContain("/private/file.txt")
    expect(JSON.stringify(identity)).not.toContain("secret content")
  })

  it("accepts the verified happy path only with receipts", () => {
    let state = "RESERVED" as const
    for (const event of ["START_EFFECT", "RECORD_EFFECT", "BEGIN_VERIFICATION", "VERIFICATION_PASSED"] as const) {
      const result = transitionSideEffectOperation({ state, event, receiptRef: `receipt:${event}` })
      expect(result.accepted).toBe(true)
      if (!result.accepted) throw new Error("transition expected")
      state = result.nextState as typeof state
    }
    expect(state).toBe("VERIFIED")
    expect(transitionSideEffectOperation({ state: "RESERVED", event: "START_EFFECT", receiptRef: "" }))
      .toMatchObject({ accepted: false, reasonCode: "receipt_required" })
  })

  it("does not treat an effect receipt as verification", () => {
    expect(transitionSideEffectOperation({
      state: "EFFECT_RECORDED",
      event: "VERIFICATION_PASSED",
      receiptRef: "receipt:effect",
    })).toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
  })

  it("records a typed pre-effect rejection as a distinct terminal state", () => {
    expect(transitionSideEffectOperation({
      state: "EFFECT_STARTED",
      event: "RECORD_REJECTION",
      receiptRef: "receipt:rejection",
    })).toMatchObject({ accepted: true, nextState: "EFFECT_REJECTED" })
    expect(transitionSideEffectOperation({
      state: "EFFECT_REJECTED",
      event: "REQUEST_CANCEL",
      receiptRef: "receipt:late",
    })).toMatchObject({ accepted: false, reasonCode: "terminal_state_locked" })
  })

  it("routes failed verification through compensation or manual intervention", () => {
    expect(transitionSideEffectOperation({ state: "VERIFYING", event: "VERIFICATION_FAILED", receiptRef: "receipt:verify" }))
      .toMatchObject({ accepted: true, nextState: "VERIFY_FAILED" })
    expect(transitionSideEffectOperation({ state: "VERIFY_FAILED", event: "BEGIN_COMPENSATION", receiptRef: "receipt:compensate" }))
      .toMatchObject({ accepted: true, nextState: "COMPENSATING" })
    expect(transitionSideEffectOperation({ state: "COMPENSATING", event: "COMPENSATION_FAILED", receiptRef: "receipt:failed" }))
      .toMatchObject({ accepted: true, nextState: "MANUAL_INTERVENTION" })
    expect(transitionSideEffectOperation({ state: "VERIFY_FAILED", event: "MARK_MANUAL", receiptRef: "receipt:manual" }))
      .toMatchObject({ accepted: true, nextState: "MANUAL_INTERVENTION" })
  })

  it("prevents a new effect after cancellation while allowing convergence", () => {
    expect(transitionSideEffectOperation({ state: "RESERVED", event: "REQUEST_CANCEL", receiptRef: "receipt:cancel" }))
      .toMatchObject({ accepted: true, nextState: "CANCEL_REQUESTED" })
    expect(transitionSideEffectOperation({ state: "CANCEL_REQUESTED", event: "START_EFFECT", receiptRef: "receipt:start" }))
      .toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
    expect(transitionSideEffectOperation({ state: "CANCEL_REQUESTED", event: "BEGIN_VERIFICATION", receiptRef: "receipt:verify" }))
      .toMatchObject({ accepted: true, nextState: "VERIFYING" })
  })

  it("locks terminal states", () => {
    for (const state of ["VERIFIED", "COMPENSATED", "MANUAL_INTERVENTION", "EFFECT_REJECTED"] as const) {
      expect(transitionSideEffectOperation({ state, event: "REQUEST_CANCEL", receiptRef: "receipt:late" }))
        .toMatchObject({ accepted: false, reasonCode: "terminal_state_locked" })
    }
  })
})
