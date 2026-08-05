import { describe, expect, it } from "vitest"
import type {
  LlmDiagnosisReceipt,
  StructuredWorkLifecycleProjection,
  StructuredWorkPlanDecision,
} from "../packages/core/src/contracts/index.ts"
import {
  type LlmDiagnosedActionFlowInput,
  decideLlmDiagnosedActionFlowAcceptance,
} from "../packages/core/src/contracts/llm-diagnosed-action-flow.ts"

const requestActions = [
  "direct_answer",
  "ask_clarification",
  "plan",
  "delegate",
  "use_tool",
  "use_yeonjang",
] as const
const resultActions = [
  "retry",
  "redelegate",
  "partial_report",
  "final_report",
  "stop_blocked",
] as const

function receipt(
  target: LlmDiagnosisReceipt["target"],
  recommendedAction: LlmDiagnosisReceipt["recommendedAction"],
  receiptId: string,
): LlmDiagnosisReceipt {
  return {
    schemaVersion: 1,
    receiptId,
    target,
    subjectKind: target === "request_diagnosis" ? "user_request" : "tool_result",
    subjectFingerprint: `${target}-subject-fingerprint`,
    diagnosisFingerprint: `${target}-diagnosis-fingerprint`,
    recommendedAction,
  }
}

function input(overrides: Partial<LlmDiagnosedActionFlowInput> = {}): LlmDiagnosedActionFlowInput {
  const plan: StructuredWorkPlanDecision = {
    workId: "work-1",
    runId: "run-1",
    ownerAgentName: "마당쇠",
    classification: "simple",
    requestReceiptId: "receipt-request",
    solutionPlanReceiptId: "receipt-plan",
    requestIntent: "use_tool",
    missingInformation: [],
    clarificationRequired: false,
    requestAction: "plan",
    steps: [
      {
        step_id: "step-1",
        owner_agent_name: "마당쇠",
        action_type: "use_tool",
        input_refs: ["input:user-request"],
        expected_output: "A verified result.",
        completion_criteria: "Evidence confirms the result.",
        status: "pending",
      },
    ],
    lifecycleStates: ["received", "diagnosis_pending", "diagnosed", "route_selected"],
  }
  const projection: StructuredWorkLifecycleProjection = {
    workId: "work-1",
    status: "completed",
    resultReceiptId: "receipt-result",
    lifecycleStates: [
      "received",
      "diagnosis_pending",
      "diagnosed",
      "route_selected",
      "executing",
      "result_diagnosis_pending",
      "result_diagnosed",
      "next_action_selected",
      "completed",
    ],
    trace: [
      {
        workId: "work-1",
        phase: "input",
        reasonCode: "request_diagnosis_received",
        stepIds: [],
        referenceIds: ["receipt-request"],
      },
      {
        workId: "work-1",
        phase: "decision",
        reasonCode: "solution_plan_received",
        stepIds: ["step-1"],
        referenceIds: ["receipt-plan"],
      },
      {
        workId: "work-1",
        phase: "decision",
        reasonCode: "simple_route_plan_step_validated",
        stepIds: ["step-1"],
        referenceIds: ["receipt-request"],
      },
      {
        workId: "work-1",
        phase: "execution",
        reasonCode: "step_results_received",
        stepIds: ["step-1"],
        referenceIds: ["result:step-1"],
      },
      {
        workId: "work-1",
        phase: "validation",
        reasonCode: "result_diagnosis_received",
        stepIds: ["step-1"],
        referenceIds: ["receipt-result", "evidence:step-1"],
      },
      {
        workId: "work-1",
        phase: "output",
        reasonCode: "simple_output_final_report_completed",
        stepIds: [],
        referenceIds: ["receipt-result", "result:step-1"],
      },
    ],
    outputRefs: ["result:step-1"],
    evidenceRefs: ["evidence:step-1"],
  }
  return {
    workId: "work-1",
    runId: "run-1",
    requestDiagnosis: {
      workId: "work-1",
      runId: "run-1",
      receipt: receipt("request_diagnosis", "plan", "receipt-request"),
    },
    resultDiagnosis: {
      workId: "work-1",
      runId: "run-1",
      receipt: receipt("result_diagnosis", "final_report", "receipt-result"),
    },
    plan,
    projection,
    selectedAction: "final_report",
    rawInputRefs: ["input:user-request"],
    rawResultRefs: ["result:step-1"],
    ...overrides,
  }
}

describe("task1281 LLM-diagnosed action flow acceptance", () => {
  it("accepts the canonical request diagnosis to final action trace", () => {
    expect(decideLlmDiagnosedActionFlowAcceptance(input())).toEqual({
      status: "accepted",
      workId: "work-1",
      runId: "run-1",
      requestReceiptId: "receipt-request",
      resultReceiptId: "receipt-result",
      selectedAction: "final_report",
      traceReasonCodes: [
        "request_diagnosis_received",
        "solution_plan_received",
        "simple_route_plan_step_validated",
        "step_results_received",
        "result_diagnosis_received",
        "simple_output_final_report_completed",
      ],
    })
  })

  it.each(requestActions)("requires request diagnosis before %s routing", (action) => {
    const value = input()
    value.plan.requestAction = action
    value.requestDiagnosis = undefined
    expect(decideLlmDiagnosedActionFlowAcceptance(value)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "raw_input_not_authoritative" }),
      ]),
    })
  })

  it.each(resultActions)("requires result diagnosis before %s action", (action) => {
    const value = input({ selectedAction: action })
    value.resultDiagnosis = undefined
    value.projection.trace[5] = {
      ...value.projection.trace[5]!,
      reasonCode: `simple_output_${action}_running`,
    }
    expect(decideLlmDiagnosedActionFlowAcceptance(value)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "raw_result_not_authoritative" }),
      ]),
    })
  })

  it("rejects action mismatch and mixed work or run diagnosis bindings", () => {
    const value = input({ selectedAction: "retry" })
    value.requestDiagnosis = { ...value.requestDiagnosis!, runId: "run-other" }
    value.resultDiagnosis = { ...value.resultDiagnosis!, workId: "work-other" }
    expect(decideLlmDiagnosedActionFlowAcceptance(value)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "diagnosis_action_mismatch" }),
        expect.objectContaining({ code: "request_diagnosis_scope_mismatch" }),
        expect.objectContaining({ code: "result_diagnosis_scope_mismatch" }),
      ]),
    })
  })

  it("rejects missing and out-of-order canonical phases", () => {
    const missing = input()
    missing.projection.trace = missing.projection.trace.filter(
      (event) => event.reasonCode !== "result_diagnosis_received",
    )
    expect(decideLlmDiagnosedActionFlowAcceptance(missing)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "required_trace_phase_missing" }),
      ]),
    })

    const reversed = input()
    const execution = reversed.projection.trace[3]!
    reversed.projection.trace[3] = reversed.projection.trace[4]!
    reversed.projection.trace[4] = execution
    expect(decideLlmDiagnosedActionFlowAcceptance(reversed)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "trace_phase_order_invalid" }),
      ]),
    })
  })

  it("does not mutate diagnosis bindings, plans, projections, or provenance", () => {
    const value = input()
    const before = structuredClone(value)
    decideLlmDiagnosedActionFlowAcceptance(value)
    expect(value).toEqual(before)
  })

  it("rejects a solution-plan trace that references a different receipt", () => {
    const value = input()
    value.projection.trace[1] = {
      ...value.projection.trace[1]!,
      referenceIds: ["receipt:plan:other"],
    }
    expect(decideLlmDiagnosedActionFlowAcceptance(value)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "plan_receipt_reference_mismatch" }),
      ]),
    })
  })
})
