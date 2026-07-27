import { describe, expect, it } from "vitest"

import { createPerformanceCostBaseline } from "../scripts/audit-performance-cost-baseline.mjs"

describe("task005 performance baseline CLI", () => {
  it("creates a complete deterministic receipt without raw labels", () => {
    const result = createPerformanceCostBaseline()
    expect(result.complete).toBe(true)
    expect(result.counts.requiredFlows).toBe(5)
    expect(result.counts.coveredFlows).toBe(5)
    expect(JSON.stringify(result)).not.toContain("prompt")
    expect(JSON.stringify(result)).not.toContain("secret")
  })
})
