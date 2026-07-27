import { describe, expect, it } from "vitest"

import {
  type WorkStepPlanItem,
  createLlmSolutionPlanReceipt,
  validateLlmSolutionPlanReceipt,
} from "../packages/core/src/contracts/index.ts"

function step(id: string): WorkStepPlanItem {
  return {
    step_id: id,
    owner_agent_name: "마당쇠",
    action_type: "use_tool",
    input_refs: ["request:1"],
    expected_output: `output:${id}`,
    completion_criteria: `criterion:${id}`,
    status: "pending",
  }
}

const plan = {
  ownerAgentName: "마당쇠",
  steps: [step("collect"), step("verify")],
}

describe("task012 LLM solution-plan receipt", () => {
  it("binds an independently issued plan to work, run, diagnosis receipt and exact steps", () => {
    const receipt = createLlmSolutionPlanReceipt({
      receiptId: "receipt:plan:1",
      workId: "work:1",
      runId: "run:1",
      requestDiagnosisReceiptId: "receipt:diagnosis:1",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      plan,
    })

    expect(receipt).toMatchObject({
      schemaVersion: 1,
      receiptId: "receipt:plan:1",
      workId: "work:1",
      runId: "run:1",
      requestDiagnosisReceiptId: "receipt:diagnosis:1",
      issuedAt: 101,
    })
    expect(receipt.planFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(
      validateLlmSolutionPlanReceipt({
        receipt,
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
        requestDiagnosisIssuedAt: 100,
        plan,
      }),
    ).toEqual({ ok: true })
  })

  it("rejects missing receipt, cross-scope reuse, reordered issuance, and mutated plan payload", () => {
    const receipt = createLlmSolutionPlanReceipt({
      receiptId: "receipt:plan:1",
      workId: "work:1",
      runId: "run:1",
      requestDiagnosisReceiptId: "receipt:diagnosis:1",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      plan,
    })

    expect(
      validateLlmSolutionPlanReceipt({
        receipt: undefined,
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
        requestDiagnosisIssuedAt: 100,
        plan,
      }),
    ).toEqual({ ok: false, reasonCode: "solution_plan_receipt_missing" })
    expect(
      validateLlmSolutionPlanReceipt({
        receipt,
        workId: "work:2",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
        requestDiagnosisIssuedAt: 100,
        plan,
      }),
    ).toEqual({ ok: false, reasonCode: "solution_plan_scope_mismatch" })
    expect(
      validateLlmSolutionPlanReceipt({
        receipt,
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:2",
        requestDiagnosisIssuedAt: 100,
        plan,
      }),
    ).toEqual({ ok: false, reasonCode: "solution_plan_diagnosis_mismatch" })
    expect(
      validateLlmSolutionPlanReceipt({
        receipt,
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
        requestDiagnosisIssuedAt: 101,
        plan,
      }),
    ).toEqual({ ok: false, reasonCode: "solution_plan_order_invalid" })
    expect(
      validateLlmSolutionPlanReceipt({
        receipt,
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
        requestDiagnosisIssuedAt: 100,
        plan: { ...plan, steps: [step("collect"), step("changed")] },
      }),
    ).toEqual({ ok: false, reasonCode: "solution_plan_fingerprint_mismatch" })
  })

  it("rejects malformed plan creation before issuing a receipt", () => {
    expect(() =>
      createLlmSolutionPlanReceipt({
        receiptId: "receipt:plan:1",
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
        requestDiagnosisIssuedAt: 100,
        issuedAt: 101,
        plan: { ownerAgentName: "마당쇠", steps: [] },
      }),
    ).toThrow(/at least one step/i)
    expect(() =>
      createLlmSolutionPlanReceipt({
        receiptId: "receipt:plan:1",
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
        requestDiagnosisIssuedAt: 100,
        issuedAt: 101,
        plan: { ownerAgentName: "마당쇠", steps: [step("same"), step("same")] },
      }),
    ).toThrow(/unique/i)
  })
})
