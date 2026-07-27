import { describe, expect, it } from "vitest"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import { createRuntimeSolutionPlanProvider } from "../packages/core/src/runs/solution-plan-provider-runtime.ts"

const provider: AIProvider = {
  id: "fake",
  supportedModels: ["fake-model"],
  maxContextTokens: () => 1_000,
  async *chat(_params: ChatParams): AsyncGenerator<AIChunk> {},
}

describe("task014 runtime solution-plan provider", () => {
  it("creates the provider from explicit startup inputs", () => {
    const planned = {
      planSolution: async () => ({}),
      repairSolutionPlan: async () => ({}),
    }
    expect(
      createRuntimeSolutionPlanProvider({
        provider,
        model: "fake-model",
        workDir: "/workspace",
        factory: (input) => {
          expect(input).toEqual({ provider, model: "fake-model", workDir: "/workspace" })
          return planned
        },
      }),
    ).toEqual({
      status: "ready",
      solutionPlanProvider: planned,
      solutionPlanRepairProvider: planned,
      fieldDebugEvent: "runtime_solution_plan_provider:ready",
    })
  })

  it("skips missing startup inputs without environment fallback", () => {
    expect(createRuntimeSolutionPlanProvider({ workDir: "/workspace" })).toMatchObject({
      status: "skipped",
      reasonCode: "provider_missing",
    })
    expect(
      createRuntimeSolutionPlanProvider({ provider, model: " ", workDir: "/workspace" }),
    ).toMatchObject({
      status: "skipped",
      reasonCode: "model_missing",
    })
  })

  it("returns a redacted unavailable event when factory creation fails", () => {
    const result = createRuntimeSolutionPlanProvider({
      provider,
      model: "fake-model",
      workDir: "/workspace",
      factory: () => {
        throw new Error("token=secret planning source missing")
      },
    })
    expect(result).toMatchObject({
      status: "unavailable",
      reasonCode: "solution_plan_provider_factory_failed",
    })
    expect(result.fieldDebugEvent).not.toContain("secret")
  })
})
