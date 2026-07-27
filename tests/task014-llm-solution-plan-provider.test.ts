import { describe, expect, it } from "vitest"

import {
  type LlmSolutionPlanPayload,
  type LlmSolutionPlanProvider,
  runLlmSolutionPlanProvider,
} from "../packages/core/src/contracts/index.ts"

const plan: LlmSolutionPlanPayload = {
  ownerAgentName: "마당쇠",
  steps: [
    {
      step_id: "inspect",
      owner_agent_name: "마당쇠",
      action_type: "use_tool",
      input_refs: ["request:1"],
      expected_output: "Current repository state.",
      completion_criteria: "Repository state is supported by command evidence.",
      status: "pending",
    },
  ],
}

const input = {
  workId: "work:1",
  runId: "run:1",
  ownerAgentName: "마당쇠",
  requestDiagnosisReceiptId: "receipt:diagnosis:1",
  requestDiagnosisIssuedAt: 100,
  issuedAt: 101,
  goal: "Inspect the repository.",
  constraints: ["Do not modify files."],
  capabilityRefs: ["tool:shell-read"],
  completionCriteria: ["Return command-backed repository state."],
}

describe("task014 LLM solution-plan provider", () => {
  it("issues a scoped receipt only from the injected provider plan output", async () => {
    const calls: unknown[] = []
    const provider: LlmSolutionPlanProvider = {
      planSolution: async (providerInput) => {
        calls.push(providerInput)
        return plan
      },
    }

    const result = await runLlmSolutionPlanProvider({ ...input, provider })

    expect(calls).toEqual([
      expect.objectContaining({
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
        capabilityRefs: ["tool:shell-read"],
      }),
    ])
    expect(result).toMatchObject({
      status: "valid",
      plan,
      receipt: {
        workId: "work:1",
        runId: "run:1",
        requestDiagnosisReceiptId: "receipt:diagnosis:1",
      },
    })
  })

  it("blocks invalid provider output without synthesizing fallback steps", async () => {
    const result = await runLlmSolutionPlanProvider({
      ...input,
      provider: { planSolution: async () => ({ ownerAgentName: "마당쇠", steps: [] }) },
    })

    expect(result).toEqual({
      status: "blocked",
      reasonCode: "invalid_solution_plan_output",
      workId: "work:1",
      runId: "run:1",
    })
    expect(result).not.toHaveProperty("plan")
    expect(result).not.toHaveProperty("receipt")
  })

  it("does not call the provider when required scope or completion criteria are missing", async () => {
    let calls = 0
    const provider: LlmSolutionPlanProvider = {
      planSolution: async () => {
        calls += 1
        return plan
      },
    }

    await expect(runLlmSolutionPlanProvider({ ...input, workId: " ", provider })).rejects.toThrow(
      /work id is required/i,
    )
    await expect(
      runLlmSolutionPlanProvider({ ...input, completionCriteria: [], provider }),
    ).rejects.toThrow(/completion criteria/i)
    expect(calls).toBe(0)
  })
})
