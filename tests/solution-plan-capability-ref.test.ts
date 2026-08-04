import { describe, expect, it } from "vitest"

import { runLlmSolutionPlanProvider } from "../packages/core/src/contracts/llm-solution-plan-provider.ts"

const capabilityRefs = ["capability:tool:web_search", "capability:tool:file_read"]

function actionStep(inputRefs: string[]) {
  return {
    step_id: "execute",
    owner_agent_name: "Knowbee",
    action_type: "use_tool" as const,
    input_refs: inputRefs,
    expected_output: "Verified evidence.",
    completion_criteria: "Evidence satisfies the request.",
    status: "pending" as const,
  }
}

async function planWith(
  inputRefs: string[],
  requiredCapabilityRefs: string[] = [],
) {
  return runLlmSolutionPlanProvider({
    provider: {
      planSolution: async () => ({
        ownerAgentName: "Knowbee",
        steps: [actionStep(inputRefs)],
      }),
    },
    workId: "work:capability-ref",
    runId: "run:capability-ref",
    ownerAgentName: "Knowbee",
    requestDiagnosisReceiptId: "receipt:diagnosis:capability-ref",
    requestDiagnosisIssuedAt: 100,
    issuedAt: 101,
    goal: "Use one admitted capability.",
    constraints: [],
    capabilityRefs,
    requiredCapabilityRefs,
    completionCriteria: ["The result is verified."],
  })
}

describe("solution-plan capability reference", () => {
  it("accepts exactly one snapshot capability ref for an action step", async () => {
    await expect(planWith(["request:user", capabilityRefs[0]])).resolves.toMatchObject({
      status: "valid",
      capabilitySelections: [
        {
          stepId: "execute",
          capabilityRef: capabilityRefs[0],
        },
      ],
    })
  })

  it("rejects an action step without a capability ref", async () => {
    await expect(planWith(["request:user"])).resolves.toMatchObject({
      status: "blocked",
      reasonCode: "solution_plan_capability_ref_missing",
    })
  })

  it("rejects an action step with multiple capability refs", async () => {
    await expect(planWith(capabilityRefs)).resolves.toMatchObject({
      status: "blocked",
      reasonCode: "solution_plan_capability_ref_ambiguous",
    })
  })

  it("rejects a canonical capability ref outside the supplied snapshot", async () => {
    await expect(planWith(["capability:tool:unknown"])).resolves.toMatchObject({
      status: "blocked",
      reasonCode: "solution_plan_capability_ref_outside_snapshot",
    })
  })

  it("rejects a plan that omits a required capability selected by prior LLM diagnosis", async () => {
    await expect(
      planWith(
        ["request:user", capabilityRefs[1]],
        [capabilityRefs[0]],
      ),
    ).resolves.toMatchObject({
      status: "blocked",
      reasonCode: "solution_plan_required_capability_ref_missing",
    })
  })
})
