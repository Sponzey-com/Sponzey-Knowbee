import { describe, expect, it } from "vitest"
import {
  CANONICAL_WORK_EVENTS,
  CANONICAL_WORK_STATES,
  transitionCanonicalWorkState,
} from "../packages/core/src/contracts/canonical-work-state.ts"

describe("canonical work state", () => {
  it("defines the complete PROJECT state and event vocabulary", () => {
    expect(CANONICAL_WORK_STATES).toEqual([
      "REQUEST_RECEIVED",
      "SOLUTION_ANALYZED",
      "POLICY_VALIDATED",
      "EXECUTING",
      "AWAITING_APPROVAL",
      "RESULT_REVIEW",
      "SUCCEEDED",
      "PARTIALLY_SUCCEEDED",
      "USER_INPUT_REQUIRED",
      "BLOCKED",
      "EXHAUSTED",
      "CANCELLED",
      "USER_REPORT",
    ])
    expect(CANONICAL_WORK_EVENTS).toEqual(expect.arrayContaining([
      "DIAGNOSIS_ACCEPTED",
      "ANALYSIS_REVISED",
      "POLICY_ALLOWED",
      "EXECUTION_STARTED",
      "ATTEMPT_RECORDED",
      "ALL_CRITERIA_VERIFIED",
      "RECOVERY_ACCEPTED",
      "PATHS_EXHAUSTED",
      "USER_CANCELLED",
      "REPORT_DELIVERED",
    ]))
  })

  it("owns approval waiting and resolution as canonical transitions", () => {
    expect(transitionCanonicalWorkState({
      currentState: "EXECUTING",
      event: "APPROVAL_REQUESTED",
      receiptRef: "approval:requested",
    })).toMatchObject({ accepted: true, nextState: "AWAITING_APPROVAL" })
    expect(transitionCanonicalWorkState({
      currentState: "AWAITING_APPROVAL",
      event: "APPROVAL_CONSUMED",
      receiptRef: "approval:consumed",
    })).toMatchObject({ accepted: true, nextState: "EXECUTING" })
    expect(transitionCanonicalWorkState({
      currentState: "AWAITING_APPROVAL",
      event: "APPROVAL_DENIED_OR_EXPIRED",
      receiptRef: "approval:denied",
    })).toMatchObject({ accepted: true, nextState: "BLOCKED" })
    expect(transitionCanonicalWorkState({
      currentState: "AWAITING_APPROVAL",
      event: "ATTEMPT_RECORDED",
      receiptRef: "attempt:before-approval",
    })).toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
  })

  it("follows the request to verified report happy path", () => {
    const commands = [
      ["REQUEST_RECEIVED", "DIAGNOSIS_ACCEPTED", "SOLUTION_ANALYZED"],
      ["SOLUTION_ANALYZED", "POLICY_ALLOWED", "POLICY_VALIDATED"],
      ["POLICY_VALIDATED", "EXECUTION_STARTED", "EXECUTING"],
      ["EXECUTING", "ATTEMPT_RECORDED", "RESULT_REVIEW"],
      ["RESULT_REVIEW", "ALL_CRITERIA_VERIFIED", "SUCCEEDED"],
      ["SUCCEEDED", "REPORT_DELIVERED", "USER_REPORT"],
    ] as const

    for (const [currentState, event, nextState] of commands) {
      expect(transitionCanonicalWorkState({ currentState, event, receiptRef: `receipt:${event}` })).toEqual({
        accepted: true,
        previousState: currentState,
        event,
        nextState,
        receiptRef: `receipt:${event}`,
      })
    }
  })

  it("keeps verified result blocking distinct from path exhaustion", () => {
    expect(transitionCanonicalWorkState({
      currentState: "RESULT_REVIEW",
      event: "RESULT_BLOCKED",
      receiptRef: "receipt:result-blocker",
    })).toMatchObject({ accepted: true, nextState: "BLOCKED" })
    expect(transitionCanonicalWorkState({
      currentState: "RESULT_REVIEW",
      event: "PATHS_EXHAUSTED",
      receiptRef: "receipt:paths-exhausted",
    })).toMatchObject({ accepted: true, nextState: "EXHAUSTED" })
  })

  it("supports changed-strategy recovery, user input, exhaustion, and cancellation", () => {
    expect(transitionCanonicalWorkState({
      currentState: "SOLUTION_ANALYZED",
      event: "ANALYSIS_REVISED",
      receiptRef: "analysis:revised",
    })).toMatchObject({ accepted: true, nextState: "SOLUTION_ANALYZED" })
    expect(transitionCanonicalWorkState({
      currentState: "EXECUTING",
      event: "ANALYSIS_REVISED",
      receiptRef: "analysis:too-late",
    })).toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
    expect(transitionCanonicalWorkState({
      currentState: "RESULT_REVIEW",
      event: "RECOVERY_ACCEPTED",
      receiptRef: "recovery:changed-strategy",
    })).toMatchObject({ accepted: true, nextState: "SOLUTION_ANALYZED" })
    expect(transitionCanonicalWorkState({
      currentState: "USER_INPUT_REQUIRED",
      event: "USER_INPUT_RECEIVED",
      receiptRef: "input:received",
    })).toMatchObject({ accepted: true, nextState: "SOLUTION_ANALYZED" })
    expect(transitionCanonicalWorkState({
      currentState: "RESULT_REVIEW",
      event: "PATHS_EXHAUSTED",
      receiptRef: "exhaustion:verified",
    })).toMatchObject({ accepted: true, nextState: "EXHAUSTED" })
    expect(transitionCanonicalWorkState({
      currentState: "EXECUTING",
      event: "USER_CANCELLED",
      receiptRef: "cancel:user",
    })).toMatchObject({ accepted: true, nextState: "CANCELLED" })
  })

  it("rejects missing receipts, state skips, and terminal reversal", () => {
    expect(transitionCanonicalWorkState({
      currentState: "REQUEST_RECEIVED",
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: " ",
    })).toEqual({
      accepted: false,
      currentState: "REQUEST_RECEIVED",
      event: "DIAGNOSIS_ACCEPTED",
      reasonCode: "receipt_required",
    })
    expect(transitionCanonicalWorkState({
      currentState: "REQUEST_RECEIVED",
      event: "ALL_CRITERIA_VERIFIED",
      receiptRef: "evidence:invalid-skip",
    })).toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
    expect(transitionCanonicalWorkState({
      currentState: "USER_REPORT",
      event: "RECOVERY_ACCEPTED",
      receiptRef: "recovery:too-late",
    })).toMatchObject({ accepted: false, reasonCode: "terminal_state_locked" })
  })
})
