import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("Task 104 canonical termination catalog", () => {
  it("owns completion, exhaustion, input, policy, cancellation, and delivery as explicit events", () => {
    const source = readFileSync(
      new URL("../packages/core/src/runs/canonical-finalization-lifecycle.ts", import.meta.url),
      "utf8",
    )
    for (const event of [
      "ALL_CRITERIA_VERIFIED",
      "PATHS_EXHAUSTED",
      "RESULT_BLOCKED",
      "INPUT_REQUIRED",
      "POLICY_BLOCKED",
      "USER_CANCELLED",
      "REPORT_DELIVERED",
    ]) {
      expect(source).toContain(`| "${event}"`)
    }
    expect(source).not.toMatch(/retryCount|retryLimit|adapterSuccess/)
  })

  it("keeps input required resumable and delivery separate from terminal candidates", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/canonical-work-state.ts", import.meta.url),
      "utf8",
    )
    expect(source).toContain('INPUT_REQUIRED: "USER_INPUT_REQUIRED"')
    expect(source).toContain('REPORT_DELIVERED: "USER_REPORT"')
    expect(source).toContain('USER_INPUT_RECEIVED: "SOLUTION_ANALYZED"')
  })
})
