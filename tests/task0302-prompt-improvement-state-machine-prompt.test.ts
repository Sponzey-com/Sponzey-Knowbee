import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task0302 prompt improvement state machine prompt contract", () => {
  it("documents the full recursive improvement state machine in prompt_improvement only", () => {
    const promptImprovement = readFileSync(join(process.cwd(), "prompts", "prompt_improvement.md"), "utf-8")
    const workflow = readFileSync(join(process.cwd(), "prompts", "workflow.md"), "utf-8")

    expect(promptImprovement).toContain("not loose flag combinations")
    expect(promptImprovement).toContain("Allowed harness states:")
    expect(promptImprovement).toContain("`idle`")
    expect(promptImprovement).toContain("`rolled_back`")
    expect(promptImprovement).toContain("Allowed harness events:")
    expect(promptImprovement).toContain("`start_requested`")
    expect(promptImprovement).toContain("`cancel_requested`")
    expect(promptImprovement).toContain("Allowed transitions:")
    expect(promptImprovement).toContain("`idle -> intake`")
    expect(promptImprovement).toContain("`reporting -> completed`")
    expect(promptImprovement).toContain("`completed`, `blocked`, and `rolled_back` are terminal states.")
    expect(promptImprovement).toContain(
      "Test failure may return from `test_execution` to `proposal_drafting` only when `recovery_policy.md` permits a changed strategy",
    )
    expect(promptImprovement).toContain("`max_retry_reached`")
    expect(promptImprovement).not.toContain("up to three attempts")

    expect(workflow).not.toContain("A state machine must define its owner")
    expect(workflow).not.toContain("Do not represent complex execution flow as loose boolean flags")
    expect(workflow).not.toContain("Allowed harness states:")
  })
})
