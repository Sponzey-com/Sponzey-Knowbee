import { describe, expect, it } from "vitest"

import {
  type LlmRequestDiagnosisRecord,
  type WorkStepPlanItem,
  createLlmDiagnosisReceipt,
  createLlmSolutionPlanReceipt,
  planStructuredWorkLifecycle,
} from "../packages/core/src/contracts/index.ts"

const subject = { requestId: "request:plan-gate" }
const diagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "A planned tool action is required.",
  intent: "planned_action",
  goal: "Execute and verify one action.",
  constraints: [],
  missing_information: [],
  risk: "reviewed",
  confidence: "sufficient",
  recommended_action: "plan",
  reason: "The LLM selected a plan.",
}
const step: WorkStepPlanItem = {
  step_id: "execute",
  owner_agent_name: "마당쇠",
  action_type: "use_tool",
  input_refs: ["request:plan-gate"],
  expected_output: "Verified output.",
  completion_criteria: "Evidence proves the output.",
  status: "pending",
}
const requestReceipt = createLlmDiagnosisReceipt({
  receiptId: "receipt:diagnosis:plan-gate",
  target: "request_diagnosis",
  subjectKind: "user_request",
  subjectPayload: subject,
  diagnosis,
})
const planReceipt = createLlmSolutionPlanReceipt({
  receiptId: "receipt:plan:plan-gate",
  workId: "work:plan-gate",
  runId: "run:plan-gate",
  requestDiagnosisReceiptId: requestReceipt.receiptId,
  requestDiagnosisIssuedAt: 100,
  issuedAt: 101,
  plan: { ownerAgentName: "마당쇠", steps: [step] },
})

function input(solutionPlanReceipt = planReceipt) {
  return {
    workId: "work:plan-gate",
    runId: "run:plan-gate",
    ownerAgentName: "마당쇠",
    subjectPayload: subject,
    diagnosis,
    receipt: requestReceipt,
    requestDiagnosisIssuedAt: 100,
    solutionPlanReceipt,
    complexity: {
      toolCount: 1,
      subAgentCount: 0,
      usesYeonjang: false,
      requiresApproval: false,
      changesFiles: false,
      longRunning: false,
    },
    proposedSteps: [step],
  }
}

describe("task013 structured lifecycle plan receipt", () => {
  it("requires and preserves an exact solution-plan receipt", () => {
    expect(() =>
      planStructuredWorkLifecycle({ ...input(), solutionPlanReceipt: undefined }),
    ).toThrow(/solution plan receipt missing/i)

    expect(planStructuredWorkLifecycle(input())).toMatchObject({
      workId: "work:plan-gate",
      runId: "run:plan-gate",
      requestReceiptId: requestReceipt.receiptId,
      solutionPlanReceiptId: planReceipt.receiptId,
    })
  })

  it("rejects a receipt after the bound plan payload changes", () => {
    expect(() =>
      planStructuredWorkLifecycle({
        ...input(),
        proposedSteps: [{ ...step, expected_output: "Mutated output." }],
      }),
    ).toThrow(/solution plan fingerprint mismatch/i)
  })
})
