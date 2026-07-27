import { describe, expect, it } from "vitest"
import {
  type FinalSuccessAdmissionInput,
  admitFinalSuccess,
} from "../packages/core/src/contracts/final-success-admission.ts"

function input(overrides: Partial<FinalSuccessAdmissionInput> = {}): FinalSuccessAdmissionInput {
  return {
    workId: "work:92",
    analyzedStepIds: ["collect", "verify"],
    stepReceipts: [
      { receiptId: "receipt:collect", workId: "work:92", stepId: "collect", status: "succeeded" },
      { receiptId: "receipt:verify", workId: "work:92", stepId: "verify", status: "succeeded" },
    ],
    criteria: [
      { criterionId: "current_value", status: "satisfied", evidenceRefs: ["evidence:value"] },
      { criterionId: "freshness", status: "satisfied", evidenceRefs: ["evidence:timestamp"] },
    ],
    resultReview: {
      receiptId: "receipt:review:92",
      workId: "work:92",
      sufficiency: "sufficient",
      resultRef: "result:current-value",
      requiredEvidenceRefs: ["evidence:value", "evidence:timestamp"],
    },
    finalPayload: {
      resultRef: "result:current-value",
      evidenceRefs: ["evidence:value", "evidence:timestamp"],
    },
    deliveryReceipt: {
      receiptId: "receipt:delivery:92",
      workId: "work:92",
      resultRef: "result:current-value",
      status: "delivered",
    },
    ...overrides,
  }
}

describe("Task 092 final success admission", () => {
  it("admits a completed requested result with necessary evidence and delivery receipt", () => {
    expect(admitFinalSuccess(input())).toEqual({
      status: "success",
      workId: "work:92",
      resultRef: "result:current-value",
      evidenceRefs: ["evidence:timestamp", "evidence:value"],
      reviewReceiptId: "receipt:review:92",
      deliveryReceiptId: "receipt:delivery:92",
    })
  })

  it("rejects partial tool execution or an incomplete LLM-reviewed answer", () => {
    const partialStep = input()
    const firstStepReceipt = partialStep.stepReceipts[0]
    if (!firstStepReceipt) throw new Error("Test fixture requires a first step receipt.")
    partialStep.stepReceipts[0] = { ...firstStepReceipt, status: "partial" }
    expect(admitFinalSuccess(partialStep)).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["analyzed_steps_incomplete"]),
    })
    expect(
      admitFinalSuccess(
        input({ resultReview: { ...input().resultReview, sufficiency: "partial" } }),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["result_not_sufficient"]),
    })
  })

  it("rejects unsatisfied criteria, missing evidence, or missing delivery", () => {
    const unsatisfied = input()
    const firstCriterion = unsatisfied.criteria[0]
    if (!firstCriterion) throw new Error("Test fixture requires a first criterion.")
    unsatisfied.criteria[0] = { ...firstCriterion, status: "unsatisfied" }
    expect(admitFinalSuccess(unsatisfied)).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["completion_criteria_unsatisfied"]),
    })
    expect(
      admitFinalSuccess(
        input({
          finalPayload: { resultRef: "result:current-value", evidenceRefs: ["evidence:value"] },
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["required_evidence_missing"]),
    })
    expect(admitFinalSuccess(input({ deliveryReceipt: undefined }))).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["final_delivery_missing"]),
    })
  })

  it("rejects foreign-work, invented, or post-review-mutated evidence", () => {
    const secondStepReceipt = input().stepReceipts[1]
    if (!secondStepReceipt) throw new Error("Test fixture requires a second step receipt.")
    expect(
      admitFinalSuccess(
        input({
          stepReceipts: [
            {
              receiptId: "receipt:collect",
              workId: "work:other",
              stepId: "collect",
              status: "succeeded",
            },
            secondStepReceipt,
          ],
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["final_success_scope_mismatch"]),
    })
    expect(
      admitFinalSuccess(
        input({
          finalPayload: {
            resultRef: "result:current-value",
            evidenceRefs: ["evidence:value", "evidence:invented"],
          },
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["final_evidence_mismatch"]),
    })
    expect(
      admitFinalSuccess(
        input({ finalPayload: { ...input().finalPayload, resultRef: "result:mutated" } }),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["final_result_mismatch"]),
    })
  })
})
