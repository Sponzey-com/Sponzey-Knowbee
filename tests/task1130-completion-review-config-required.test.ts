import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1130 completion review config required", () => {
  it("requires an explicit config snapshot without singleton fallback", () => {
    const source = readFileSync("packages/core/src/agent/completion-review.ts", "utf-8")

    expect(source).toContain("config: KnowbeeConfig")
    expect(source).toContain("const config = params.config")
    expect(source).not.toContain("import { getConfig }")
    expect(source).not.toContain("params.config ?? getConfig()")
  })

  it("requires callers to forward config into completion review", () => {
    const reviewPass = readFileSync("packages/core/src/runs/review-pass.ts", "utf-8")
    const intakeBridge = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")

    expect(reviewPass).toContain("config: KnowbeeConfig")
    expect(reviewPass).toContain("review = await dependencies.reviewTaskCompletion")
    expect(reviewPass).toContain("config: params.config")
    expect(intakeBridge).toContain("if (!reviewer || !input.params.config) return null")
  })
})
