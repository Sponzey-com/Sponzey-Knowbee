import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { transitionCanonicalWorkState } from "../packages/core/src/contracts/canonical-work-state.ts"
import {
  type LlmSolutionPlanPayload,
  runLlmSolutionPlanProviderWithRepair,
} from "../packages/core/src/contracts/llm-solution-plan-provider.ts"

const input = {
  workId: "work:task025",
  runId: "run:task025",
  ownerAgentName: "Main agent",
  requestDiagnosisReceiptId: "receipt:request-diagnosis:task025",
  requestDiagnosisIssuedAt: 100,
  issuedAt: 101,
  goal: "Produce an evidence-backed answer.",
  constraints: ["Do not invent evidence."],
  capabilityRefs: ["tool:web_search"],
  completionCriteria: ["The answer cites current evidence."],
}

const validPlan: LlmSolutionPlanPayload = {
  ownerAgentName: "Main agent",
  steps: [
    {
      step_id: "verify-current-value",
      owner_agent_name: "Main agent",
      action_type: "use_tool",
      input_refs: ["receipt:request-diagnosis:task025", "capability:tool:web_search"],
      expected_output: "Current value with timestamp.",
      completion_criteria: "Fresh primary evidence supports the value.",
      status: "pending",
    },
  ],
}

describe("Task 025 receipt order and solution-plan repair", () => {
  it("rejects plan, execution, and success events when predecessor receipts are absent", () => {
    expect(
      transitionCanonicalWorkState({
        currentState: "REQUEST_RECEIVED",
        event: "POLICY_ALLOWED",
        receiptRef: "receipt:plan",
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
        receiptRef: "receipt:result",
      }),
    ).toMatchObject({ accepted: false, reasonCode: "transition_not_allowed" })
    expect(
      transitionCanonicalWorkState({
        currentState: "RESULT_REVIEW",
        event: "ALL_CRITERIA_VERIFIED",
        receiptRef: " ",
      }),
    ).toMatchObject({ accepted: false, reasonCode: "receipt_required" })
  })

  it("repairs one malformed solution plan with the exact original subject", async () => {
    const repairSolutionPlan = vi.fn(async () => validPlan)
    const result = await runLlmSolutionPlanProviderWithRepair({
      ...input,
      provider: { planSolution: async () => ({ malformed: true }) },
      repairProvider: { repairSolutionPlan },
    })

    expect(result).toMatchObject({
      status: "valid",
      repairAttempted: true,
      plan: validPlan,
      receipt: {
        requestDiagnosisReceiptId: input.requestDiagnosisReceiptId,
      },
    })
    expect(repairSolutionPlan).toHaveBeenCalledWith({
      subject: expect.objectContaining({
        workId: input.workId,
        runId: input.runId,
        requestDiagnosisReceiptId: input.requestDiagnosisReceiptId,
        goal: input.goal,
      }),
      invalidRawOutput: { malformed: true },
      validationIssues: [
        {
          code: "solution_plan_schema_invalid",
          path: "$",
          message: "Solution plan must match the scoped solution-plan schema.",
        },
      ],
      failedInputRefs: ["llm-output:solution_plan"],
      failedStrategy: "initial_llm_solution_plan",
      repairAttemptNumber: 1,
    })
  })

  it("repairs one Tool step that omitted its scoped capability ref", async () => {
    const repairSolutionPlan = vi.fn(async () => validPlan)
    const result = await runLlmSolutionPlanProviderWithRepair({
      ...input,
      provider: {
        planSolution: async () => ({
          ...validPlan,
          steps: [
            {
              ...validPlan.steps[0],
              input_refs: ["receipt:request-diagnosis:task025"],
            },
          ],
        }),
      },
      repairProvider: { repairSolutionPlan },
    })

    expect(result).toMatchObject({
      status: "valid",
      repairAttempted: true,
      plan: validPlan,
    })
    expect(repairSolutionPlan).toHaveBeenCalledWith(expect.objectContaining({
      validationIssues: [
        expect.objectContaining({
          message: expect.stringContaining("exactly one provided capability reference"),
        }),
      ],
    }))
  })

  it("reports the bounded reason when capability-ref repair is still invalid", async () => {
    const invalidPlan = {
      ...validPlan,
      steps: [
        {
          ...validPlan.steps[0],
          input_refs: ["receipt:request-diagnosis:task025"],
        },
      ],
    }
    const result = await runLlmSolutionPlanProviderWithRepair({
      ...input,
      provider: { planSolution: async () => invalidPlan },
      repairProvider: { repairSolutionPlan: async () => invalidPlan },
    })

    expect(result).toMatchObject({
      status: "blocked",
      reasonCode: "invalid_solution_plan_after_schema_repair",
      repairAttempted: true,
      repairFailureReasonCode: "solution_plan_capability_ref_missing",
    })
  })

  it("blocks after one malformed repair without synthesizing a code plan", async () => {
    const result = await runLlmSolutionPlanProviderWithRepair({
      ...input,
      provider: { planSolution: async () => ({ malformed: "initial" }) },
      repairProvider: {
        repairSolutionPlan: async () => ({ malformed: "repair" }),
      },
    })

    expect(result).toEqual({
      status: "blocked",
      reasonCode: "invalid_solution_plan_after_schema_repair",
      workId: input.workId,
      runId: input.runId,
      repairAttempted: true,
      repairFailureReasonCode: "invalid_solution_plan_output",
      reanalysis: {
        action: "changed_strategy_reanalysis",
        failedInputRefs: ["llm-output:solution_plan", "llm-output:repaired_solution_plan"],
        failedStrategies: ["initial_llm_solution_plan", "schema_repair"],
      },
    })
    expect(result).not.toHaveProperty("plan")
    expect(result).not.toHaveProperty("receipt")
  })

  it("wires repair into topology admission and changed-strategy root reentry", () => {
    const topologySource = readFileSync("packages/core/src/topology-runtime/harness.ts", "utf8")
    const planningSource = readFileSync("packages/core/src/runs/canonical-self-solve-capability-planning.ts", "utf8")
    const rootDriverSource = readFileSync("packages/core/src/runs/root-run-driver.ts", "utf8")

    expect(planningSource).toContain("runLlmSolutionPlanProviderWithRepair")
    expect(topologySource).toContain("solutionPlanRepairProvider")
    expect(rootDriverSource).toContain('reasonCode === "planning_admission_blocked"')
    expect(rootDriverSource).toContain("topologyFallbackAdmitted = true")
  })
})
