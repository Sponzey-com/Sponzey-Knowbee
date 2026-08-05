import { describe, expect, it } from "vitest"
import {
  type LlmDiagnosisGateResult,
  type StructuredWorkDecisionReadinessInput,
  type StructuredWorkPlanDecision,
  type WorkRecord,
  createLlmDiagnosisReceipt,
  decideStructuredWorkDecisionReadiness,
} from "../packages/core/src/contracts/index.ts"

function record(): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-1282",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "completed",
    user_request_summary: "Inspect and verify the repository.",
    request_diagnosis: {
      diagnosis_summary: "The request requires multiple explicit steps.",
      intent: "inspect_repository",
      goal: "Inspect and verify the repository.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "The work is complex.",
    },
    step_plan: ["inspect", "verify"].map((stepId) => ({
      step_id: stepId,
      owner_agent_name: "마당쇠",
      action_type: "validate" as const,
      input_refs: ["request:1"],
      expected_output: `${stepId} output`,
      completion_criteria: `${stepId} has evidence`,
      status: "completed" as const,
    })),
    step_results: ["inspect", "verify"].map((stepId) => ({
      step_id: stepId,
      status: "completed" as const,
      output_ref: `result:${stepId}`,
      evidence_refs: [`evidence:${stepId}`],
    })),
    result_diagnosis: {
      diagnosis_summary: "Both steps are complete and verified.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "All completion criteria have evidence.",
    },
    retry_count: 0,
    retry_limit: 1,
    action_decision: { selected_action: "final_report", reason: "Report the verified result." },
  }
}

function plan(value = record()): StructuredWorkPlanDecision {
  return {
    workId: value.work_id,
    runId: `run:${value.work_id}`,
    ownerAgentName: value.owner_agent_name,
    classification: "complex",
    requestReceiptId: "receipt:request",
    solutionPlanReceiptId: "receipt:solution-plan",
    requestIntent: value.request_diagnosis.intent,
    missingInformation: [...value.request_diagnosis.missing_information],
    clarificationRequired: value.request_diagnosis.recommended_action === "ask_clarification",
    requestAction: value.request_diagnosis.recommended_action,
    steps: value.step_plan.map((step) => ({ ...step, status: "pending" as const })),
    lifecycleStates: ["received", "diagnosis_pending", "diagnosed", "route_selected"],
  }
}

function resultGate(value = record()): LlmDiagnosisGateResult {
  return {
    status: "valid",
    target: "result_diagnosis",
    diagnosis: value.result_diagnosis,
    receipt: createLlmDiagnosisReceipt({
      receiptId: "receipt:result",
      target: "result_diagnosis",
      subjectKind: "validation_result",
      subjectPayload: {
        workId: value.work_id,
        outputRefs: value.step_results.map((item) => item.output_ref),
      },
      diagnosis: value.result_diagnosis,
    }),
  }
}

function requestGate(value: WorkRecord): LlmDiagnosisGateResult {
  return {
    status: "valid",
    target: "request_diagnosis",
    diagnosis: value.request_diagnosis,
    receipt: createLlmDiagnosisReceipt({
      receiptId: "receipt:request",
      target: "request_diagnosis",
      subjectKind: "user_request",
      subjectPayload: { workId: value.work_id },
      diagnosis: value.request_diagnosis,
    }),
  }
}

function actionInput(
  phase: "request" | "result",
  action: WorkRecord["action_decision"]["selected_action"],
): StructuredWorkDecisionReadinessInput {
  const value = record()
  if (phase === "request") {
    value.status = "planned"
    value.request_diagnosis = { ...value.request_diagnosis, recommended_action: action }
    value.action_decision = { ...value.action_decision, selected_action: action }
    value.step_plan = value.step_plan.map((step) => ({ ...step, status: "pending" }))
    value.step_results = []
    const lifecyclePlan = plan(value)
    lifecyclePlan.requestAction = action
    return {
      workRecord: value,
      phase,
      plan: lifecyclePlan,
      diagnosisGate: requestGate(value),
      selectedAction: action,
      rawStateRefs: ["raw:user-request"],
    }
  }
  value.status = action === "final_report" ? "completed" : "running"
  value.result_diagnosis = {
    ...value.result_diagnosis,
    sufficiency: action === "final_report" ? "sufficient" : "partial",
    recommended_action: action,
  }
  value.action_decision = { ...value.action_decision, selected_action: action }
  return {
    workRecord: value,
    phase,
    plan: plan(value),
    diagnosisGate: resultGate(value),
    selectedAction: action,
    rawStateRefs: ["raw:execution-result"],
  }
}

function input(
  overrides: Partial<StructuredWorkDecisionReadinessInput> = {},
): StructuredWorkDecisionReadinessInput {
  const value = record()
  return {
    workRecord: value,
    phase: "result",
    plan: plan(value),
    diagnosisGate: resultGate(value),
    selectedAction: "final_report",
    rawStateRefs: ["raw:tool-result"],
    ...overrides,
  }
}

describe("task1282 structured work decision readiness", () => {
  it("accepts a schema-valid complex WorkRecord and valid diagnosis gate", () => {
    expect(decideStructuredWorkDecisionReadiness(input())).toEqual({
      status: "ready",
      workId: "work-1282",
      phase: "result",
      classification: "complex",
      stepIds: ["inspect", "verify"],
      diagnosisReceiptId: "receipt:result",
      selectedAction: "final_report",
    })
  })

  it.each([
    "direct_answer",
    "ask_clarification",
    "plan",
    "delegate",
    "use_tool",
    "use_yeonjang",
  ] as const)("applies the same request-phase readiness to %s", (action) => {
    expect(decideStructuredWorkDecisionReadiness(actionInput("request", action))).toMatchObject({
      status: "ready",
      phase: "request",
      selectedAction: action,
    })
  })

  it.each(["retry", "redelegate", "partial_report", "final_report", "stop_blocked"] as const)(
    "applies the same result-phase readiness to %s",
    (action) => {
      expect(decideStructuredWorkDecisionReadiness(actionInput("result", action))).toMatchObject({
        status: "ready",
        phase: "result",
        selectedAction: action,
      })
    },
  )

  it("rejects raw state without a canonical WorkRecord", () => {
    expect(decideStructuredWorkDecisionReadiness(input({ workRecord: undefined }))).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "structured_work_record_required" }),
      ]),
    })
  })

  it("rejects a complex plan with missing steps or completion criteria", () => {
    const missingStep = input()
    missingStep.plan.steps = missingStep.plan.steps.slice(0, 1)
    expect(decideStructuredWorkDecisionReadiness(missingStep)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "complex_step_count_invalid" }),
      ]),
    })

    const missingCriteria = input()
    missingCriteria.plan.steps[1] = { ...missingCriteria.plan.steps[1]!, completion_criteria: " " }
    expect(decideStructuredWorkDecisionReadiness(missingCriteria)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([expect.objectContaining({ code: "step_contract_invalid" })]),
    })
  })

  it("preserves canonical validation issues and rejects a non-valid diagnosis gate", () => {
    const invalidRecord = input({ workRecord: { ...record(), hidden_state: "raw prose" } })
    const rejected = decideStructuredWorkDecisionReadiness(invalidRecord)
    expect(rejected).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "work_record_schema_invalid" }),
      ]),
    })
    expect(JSON.stringify(rejected)).toContain("$.hidden_state")
    expect(JSON.stringify(rejected)).not.toContain("raw prose")

    const invalidGate = input({
      diagnosisGate: {
        status: "repair_required",
        target: "result_diagnosis",
        repairDecision: {
          action: "attempt_schema_repair",
          target: "result_diagnosis",
          ownerAgentName: "마당쇠",
          failedStepId: "verify",
          failedInputRefs: ["result:verify"],
          failedStrategy: "result_diagnosis",
          validationIssues: [],
          repairAttempt: 1,
        },
      },
    })
    expect(decideStructuredWorkDecisionReadiness(invalidGate)).toMatchObject({
      status: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "diagnosis_not_schema_valid" }),
      ]),
    })
  })

  it("rejects selected actions that differ from the WorkRecord or diagnosis", () => {
    expect(decideStructuredWorkDecisionReadiness(input({ selectedAction: "retry" }))).toMatchObject(
      {
        status: "rejected",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "selected_action_mismatch" }),
          expect.objectContaining({ code: "diagnosis_action_mismatch" }),
        ]),
      },
    )
  })

  it("does not mutate the WorkRecord, plan, diagnosis gate, or raw references", () => {
    const value = input()
    const before = structuredClone(value)
    decideStructuredWorkDecisionReadiness(value)
    expect(value).toEqual(before)
  })
})
