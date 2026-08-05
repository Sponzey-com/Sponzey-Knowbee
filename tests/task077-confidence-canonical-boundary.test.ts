import { describe, expect, it } from "vitest"
import {
  type LlmRequestDiagnosisRecord,
  authorizeDiagnosisActionRoute,
  createLlmDiagnosisReceipt,
  transitionCanonicalWorkState,
} from "../packages/core/src/contracts/index.ts"

function diagnosis(confidence: LlmRequestDiagnosisRecord["confidence"]): LlmRequestDiagnosisRecord {
  return {
    diagnosis_summary: "The request requires a verified plan.",
    intent: "execute_work",
    goal: "Execute the work through policy and evidence gates.",
    constraints: [],
    missing_information: [],
    risk: "low",
    confidence,
    recommended_action: "plan",
    reason: "A plan is required.",
  }
}

const subject = { request: "perform verified work" }

describe("Task 077 confidence and canonical state boundary", () => {
  it("does not authorize a high-confidence diagnosis without its exact receipt", () => {
    expect(() =>
      authorizeDiagnosisActionRoute({
        receipt: undefined,
        subjectPayload: subject,
        diagnosis: diagnosis("high"),
      }),
    ).toThrow(/receipt is required/i)
  })

  it("does not invent a confidence threshold when the exact low-confidence receipt is valid", () => {
    const value = diagnosis("low")
    const receipt = createLlmDiagnosisReceipt({
      receiptId: "receipt:low-confidence",
      target: "request_diagnosis",
      subjectKind: "user_request",
      subjectPayload: subject,
      diagnosis: value,
    })

    expect(
      authorizeDiagnosisActionRoute({
        receipt,
        subjectPayload: subject,
        diagnosis: value,
      }),
    ).toMatchObject({ routeKind: "planning", receiptId: "receipt:low-confidence" })
  })

  it("cannot skip diagnosis, policy, execution evidence, review, or terminal locking", () => {
    expect(
      transitionCanonicalWorkState({
        currentState: "REQUEST_RECEIVED",
        event: "POLICY_ALLOWED",
        receiptRef: "receipt:policy",
      }),
    ).toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
    expect(
      transitionCanonicalWorkState({
        currentState: "SOLUTION_ANALYZED",
        event: "EXECUTION_STARTED",
        receiptRef: "receipt:execution",
      }),
    ).toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
    expect(
      transitionCanonicalWorkState({
        currentState: "EXECUTING",
        event: "ALL_CRITERIA_VERIFIED",
        receiptRef: "receipt:review",
      }),
    ).toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
    expect(
      transitionCanonicalWorkState({
        currentState: "USER_REPORT",
        event: "REPORT_DELIVERED",
        receiptRef: "receipt:again",
      }),
    ).toMatchObject({ accepted: false, reasonCode: "terminal_state_locked" })
  })
})
