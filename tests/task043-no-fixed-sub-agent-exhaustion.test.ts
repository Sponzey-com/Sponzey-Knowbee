import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { getSubAgentResultRetryBudgetLimit } from "../packages/core/src/agent/sub-agent-result-review.ts"

describe("Task 043 no fixed-count sub-agent exhaustion", () => {
  it("keeps legacy result-review limits unbounded for every cost class", () => {
    expect(getSubAgentResultRetryBudgetLimit("default")).toBe(Number.MAX_SAFE_INTEGER)
    expect(getSubAgentResultRetryBudgetLimit("format_only")).toBe(Number.MAX_SAFE_INTEGER)
    expect(getSubAgentResultRetryBudgetLimit("risk_or_external")).toBe(Number.MAX_SAFE_INTEGER)
    expect(getSubAgentResultRetryBudgetLimit("expensive")).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("keeps fixed failed-attempt exhaustion out of active sub-agent owners", () => {
    const activeOwners = [
      "packages/core/src/agent/sub-agent-result-review.ts",
      "packages/core/src/orchestration/sub-session-control.ts",
      "packages/core/src/runs/orchestration-dispatch.ts",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")

    expect(activeOwners).not.toMatch(/retryLimit:\s*[1-9][0-9]*/u)
    expect(activeOwners).not.toMatch(/after\s+(?:one|two|three|\d+)\s+failed attempts/iu)
  })
})
