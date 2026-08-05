import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  type StructuredWorkComplexitySignals,
  type WorkStepPlanItem,
  createLlmDiagnosisReceipt,
  createLlmSolutionPlanReceipt,
  planStructuredWorkLifecycle as planStructuredWorkLifecycleWithReceipt,
  projectStructuredWorkLifecycle,
} from "../packages/core/src/contracts/index.ts"

function planStructuredWorkLifecycle(
  input: Omit<
    Parameters<typeof planStructuredWorkLifecycleWithReceipt>[0],
    "runId" | "requestDiagnosisIssuedAt" | "solutionPlanReceipt"
  >,
) {
  const runId = `run:${input.workId}`
  const requestDiagnosisIssuedAt = 100
  return planStructuredWorkLifecycleWithReceipt({
    ...input,
    runId,
    requestDiagnosisIssuedAt,
    solutionPlanReceipt: createLlmSolutionPlanReceipt({
      receiptId: `receipt:plan:${input.workId}`,
      workId: input.workId,
      runId,
      requestDiagnosisReceiptId: input.receipt?.receiptId ?? "missing-request-receipt",
      requestDiagnosisIssuedAt,
      issuedAt: 101,
      plan: { ownerAgentName: input.ownerAgentName, steps: input.proposedSteps },
    }),
  })
}

const requestPayload = { requestId: "request-1", summary: "Inspect the repository." }
const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "A repository inspection is requested.",
  intent: "inspect_repository",
  goal: "Inspect the repository.",
  constraints: ["Do not modify files."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "An explicit execution step is required.",
}
const resultPayload = {
  workId: "work-1",
  resultRefs: ["result:inspect"],
  evidenceRefs: ["test:inspect"],
}
const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The inspection result satisfies the request.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The expected output and evidence are present.",
}

function requestReceipt(diagnosis = requestDiagnosis) {
  return createLlmDiagnosisReceipt({
    receiptId: "request-receipt-1",
    target: "request_diagnosis",
    subjectKind: "user_request",
    subjectPayload: requestPayload,
    diagnosis,
  })
}

function resultReceipt(diagnosis = resultDiagnosis) {
  return createLlmDiagnosisReceipt({
    receiptId: "result-receipt-1",
    target: "result_diagnosis",
    subjectKind: "validation_result",
    subjectPayload: resultPayload,
    diagnosis,
  })
}

function step(stepId: string, action: WorkStepPlanItem["action_type"] = "plan"): WorkStepPlanItem {
  return {
    step_id: stepId,
    owner_agent_name: "마당쇠",
    action_type: action,
    input_refs: ["request:request-1"],
    expected_output: `Output for ${stepId}`,
    completion_criteria: `Evidence proves ${stepId} completed.`,
    status: "pending",
  }
}

const simpleSignals: StructuredWorkComplexitySignals = {
  toolCount: 0,
  subAgentCount: 0,
  usesYeonjang: false,
  requiresApproval: false,
  changesFiles: false,
  longRunning: false,
}

describe("task1217 canonical structured work lifecycle", () => {
  it("keeps a simple request to exactly one execution step without skipping request diagnosis", () => {
    const plan = planStructuredWorkLifecycle({
      workId: "work-1",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
      receipt: requestReceipt(),
      complexity: simpleSignals,
      proposedSteps: [step("step-1", "direct_answer")],
    })
    expect(plan).toMatchObject({
      classification: "simple",
      requestReceiptId: "request-receipt-1",
      requestIntent: "inspect_repository",
      missingInformation: [],
      clarificationRequired: false,
      lifecycleStates: ["received", "diagnosis_pending", "diagnosed", "route_selected"],
    })
    expect(plan.steps).toHaveLength(1)
  })

  it("preserves diagnosed missing information and selects clarification explicitly", () => {
    const clarificationDiagnosis: LlmRequestDiagnosisRecord = {
      ...requestDiagnosis,
      missing_information: ["Target repository is required."],
      recommended_action: "ask_clarification",
      reason: "The target must be supplied before execution.",
    }
    const plan = planStructuredWorkLifecycle({
      workId: "work-clarification",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: clarificationDiagnosis,
      receipt: requestReceipt(clarificationDiagnosis),
      complexity: simpleSignals,
      proposedSteps: [step("ask", "ask_clarification")],
    })
    expect(plan).toMatchObject({
      requestIntent: "inspect_repository",
      missingInformation: ["Target repository is required."],
      clarificationRequired: true,
      requestAction: "ask_clarification",
    })
  })

  it("rejects a clarification route that has no diagnosed missing information", () => {
    const invalidDiagnosis: LlmRequestDiagnosisRecord = {
      ...requestDiagnosis,
      recommended_action: "ask_clarification",
    }
    expect(() =>
      planStructuredWorkLifecycle({
        workId: "work-clarification",
        ownerAgentName: "마당쇠",
        subjectPayload: requestPayload,
        diagnosis: invalidDiagnosis,
        receipt: requestReceipt(invalidDiagnosis),
        complexity: simpleSignals,
        proposedSteps: [step("ask", "ask_clarification")],
      }),
    ).toThrow(/requires diagnosed missing information/i)
  })

  it.each([
    { key: "multiple tools", complexity: { ...simpleSignals, toolCount: 2 } },
    { key: "sub-agent", complexity: { ...simpleSignals, subAgentCount: 1 } },
    { key: "Yeonjang", complexity: { ...simpleSignals, usesYeonjang: true } },
    { key: "approval", complexity: { ...simpleSignals, requiresApproval: true } },
    { key: "file change", complexity: { ...simpleSignals, changesFiles: true } },
    { key: "long run", complexity: { ...simpleSignals, longRunning: true } },
  ])("requires an explicit multi-step plan for $key work", ({ complexity }) => {
    const plan = planStructuredWorkLifecycle({
      workId: "work-1",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
      receipt: requestReceipt(),
      complexity,
      proposedSteps: [step("execute", "use_tool"), step("validate", "validate")],
    })
    expect(plan.classification).toBe("complex")
    expect(plan.steps.map((item) => item.step_id)).toEqual(["execute", "validate"])
  })

  it("keeps every complex execution step and its observable completion criterion", () => {
    const plan = planStructuredWorkLifecycle({
      workId: "work-complex",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
      receipt: requestReceipt(),
      complexity: {
        toolCount: 3,
        subAgentCount: 2,
        usesYeonjang: true,
        requiresApproval: true,
        changesFiles: true,
        longRunning: true,
      },
      proposedSteps: [
        step("delegate", "delegate"),
        step("execute", "use_tool"),
        step("validate", "validate"),
      ],
    })

    expect(plan.classification).toBe("complex")
    expect(
      plan.steps.map(({ step_id, completion_criteria }) => ({ step_id, completion_criteria })),
    ).toEqual([
      { step_id: "delegate", completion_criteria: "Evidence proves delegate completed." },
      { step_id: "execute", completion_criteria: "Evidence proves execute completed." },
      { step_id: "validate", completion_criteria: "Evidence proves validate completed." },
    ])
  })

  it("rejects missing diagnosis authorization and plans that do not match complexity", () => {
    const base = {
      workId: "work-1",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
      complexity: simpleSignals,
    }
    expect(() =>
      planStructuredWorkLifecycle({ ...base, receipt: undefined, proposedSteps: [step("one")] }),
    ).toThrow(/receipt is required/i)
    expect(() =>
      planStructuredWorkLifecycle({
        ...base,
        receipt: requestReceipt(),
        proposedSteps: [step("one"), step("two")],
      }),
    ).toThrow(/simple work requires exactly one/i)
    expect(() =>
      planStructuredWorkLifecycle({
        ...base,
        receipt: requestReceipt(),
        complexity: { ...simpleSignals, changesFiles: true },
        proposedSteps: [step("one")],
      }),
    ).toThrow(/complex work requires at least two/i)
  })

  it("rejects complex steps without owner, expected output, or completion criteria", () => {
    const invalid = step("execute")
    invalid.completion_criteria = " "
    expect(() =>
      planStructuredWorkLifecycle({
        workId: "work-1",
        ownerAgentName: "마당쇠",
        subjectPayload: requestPayload,
        diagnosis: requestDiagnosis,
        receipt: requestReceipt(),
        complexity: { ...simpleSignals, changesFiles: true },
        proposedSteps: [invalid, step("validate")],
      }),
    ).toThrow(/completion criteria/i)
  })

  it("projects input, decision, execution, validation, and output in one trace", () => {
    const plan = planStructuredWorkLifecycle({
      workId: "work-1",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
      receipt: requestReceipt(),
      complexity: simpleSignals,
      proposedSteps: [step("inspect", "direct_answer")],
    })
    const result = projectStructuredWorkLifecycle({
      plan,
      stepResults: [
        { stepId: "inspect", outputRef: "result:inspect", evidenceRefs: ["test:inspect"] },
      ],
      resultSubjectPayload: resultPayload,
      resultDiagnosis,
      resultReceipt: resultReceipt(),
    })
    expect(result.status).toBe("completed")
    expect(result.lifecycleStates).toEqual([
      "received",
      "diagnosis_pending",
      "diagnosed",
      "route_selected",
      "executing",
      "result_diagnosis_pending",
      "result_diagnosed",
      "next_action_selected",
      "completed",
    ])
    expect(result.trace.map((event) => event.phase)).toEqual([
      "input",
      "decision",
      "decision",
      "execution",
      "validation",
      "output",
    ])
    expect(result.trace.map((event) => event.reasonCode)).toEqual([
      "request_diagnosis_received",
      "solution_plan_received",
      "simple_route_plan_step_validated",
      "step_results_received",
      "result_diagnosis_received",
      "simple_output_final_report_completed",
    ])
    expect(result.trace.every((event) => event.workId === "work-1")).toBe(true)
    expect(result.outputRefs).toEqual(["result:inspect"])
    expect(result.evidenceRefs).toEqual(["test:inspect"])
  })

  it("keeps explicit decomposition and next-action phases for complex work", () => {
    const plan = planStructuredWorkLifecycle({
      workId: "work-1",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
      receipt: requestReceipt(),
      complexity: { ...simpleSignals, changesFiles: true },
      proposedSteps: [step("execute", "use_tool"), step("validate", "validate")],
    })
    const result = projectStructuredWorkLifecycle({
      plan,
      stepResults: [
        { stepId: "execute", outputRef: "result:execute", evidenceRefs: ["test:execute"] },
        { stepId: "validate", outputRef: "result:validate", evidenceRefs: ["test:validate"] },
      ],
      resultSubjectPayload: resultPayload,
      resultDiagnosis,
      resultReceipt: resultReceipt(),
    })

    expect(result.trace.map((event) => event.phase)).toEqual([
      "input",
      "decision",
      "decision",
      "decision",
      "execution",
      "validation",
      "decision",
      "output",
    ])
    expect(result.trace.map((event) => event.reasonCode)).toEqual([
      "request_diagnosis_received",
      "solution_plan_received",
      "work_classified_complex",
      "step_plan_validated",
      "step_results_received",
      "result_diagnosis_received",
      "next_action_final_report",
      "lifecycle_completed",
    ])
  })

  it("rejects missing step results, unknown step references, and mismatched result receipts", () => {
    const plan = planStructuredWorkLifecycle({
      workId: "work-1",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
      receipt: requestReceipt(),
      complexity: simpleSignals,
      proposedSteps: [step("inspect")],
    })
    const base = {
      plan,
      resultSubjectPayload: resultPayload,
      resultDiagnosis,
      resultReceipt: resultReceipt(),
    }
    expect(() => projectStructuredWorkLifecycle({ ...base, stepResults: [] })).toThrow(
      /result for every planned step/i,
    )
    expect(() =>
      projectStructuredWorkLifecycle({
        ...base,
        stepResults: [{ stepId: "unknown", outputRef: "result:x", evidenceRefs: ["evidence:x"] }],
      }),
    ).toThrow(/unknown planned step/i)
    expect(() =>
      projectStructuredWorkLifecycle({
        ...base,
        resultSubjectPayload: { ...resultPayload, workId: "changed" },
        stepResults: [
          { stepId: "inspect", outputRef: "result:inspect", evidenceRefs: ["test:inspect"] },
        ],
      }),
    ).toThrow(/subject fingerprint/i)
  })

  it("keeps the lifecycle owner framework-free and free of hidden environment state", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/structured-work-lifecycle.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(
      /from ["'](?:openai|@anthropic-ai\/sdk|better-sqlite3|node:fs|node:http|node:https|node:net)["']/,
    )
    expect(source).not.toMatch(/process\.env|readFile|fetch\(|globalThis/)
    expect(source).not.toMatch(/type StructuredWorkLifecycleState/)
  })
})
