import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1141 final response and review config required", () => {
  it("requires config for final response and scheduled response rendering", () => {
    const renderer = source("packages/core/src/runs/final-response-renderer.ts")
    const scheduler = source("packages/core/src/scheduler/final-response.ts")

    expect(renderer).toContain("config: AIProviderConfigSnapshot")
    expect(renderer).not.toContain("config?: AIProviderConfigSnapshot")
    expect(renderer).not.toContain("!providerId || !input.config")

    expect(scheduler).toContain("config: AIProviderConfigSnapshot")
    expect(scheduler).not.toContain("config?: AIProviderConfigSnapshot")
    expect(scheduler).toContain("config: params.config")
    expect(scheduler).not.toContain("...(params.config ? { config: params.config } : {})")
  })

  it("requires config throughout completion review passes", () => {
    const reviewPass = source("packages/core/src/runs/review-pass.ts")
    const reviewCycle = source("packages/core/src/runs/review-cycle-pass.ts")

    expect(reviewPass).toContain("config: KnowbeeConfig")
    expect(reviewPass).not.toContain("config?: KnowbeeConfig")
    expect(reviewPass).not.toContain("const review = params.config")
    expect(reviewCycle).toContain("config: KnowbeeConfig")
    expect(reviewCycle).not.toContain("config?: KnowbeeConfig")
    expect(reviewCycle).toContain("config: params.config")
    expect(reviewCycle).not.toContain("...(params.config ? { config: params.config } : {})")
  })
})
