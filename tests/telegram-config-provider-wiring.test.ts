import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("Telegram config-only provider wiring", () => {
  it("uses one resolved attempt provider for capability selection and root driver dependencies", () => {
    const source = readFileSync("packages/core/src/runs/start.ts", "utf8")

    expect(source).toContain("resolveRunLlmRuntime({")
    expect(source).toContain("const attemptProvider =")
    expect(source).toContain("toRunLlmRuntimePreflightFailure(attemptLlmRuntime)")
    expect(source).toContain("attemptLlmRuntimeFailure ?? contextPlan.preflightFailure")
    expect(source).toMatch(
      /createRuntimeCapabilitySelectionProvider\(\{[\s\S]*provider: attemptProvider/u,
    )
    expect(source).toMatch(
      /buildStartRootRunDriverDependencies\(\{[\s\S]*provider: attemptProvider/u,
    )
    expect(source).not.toMatch(
      /buildStartRootRunDriverDependencies\(\{[\s\S]*provider: params\.provider/u,
    )
  })
})
