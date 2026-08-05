import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SOUL_FORBIDDEN_EXECUTION_DETAILS = [
  "Try a suitable direct child SubAgent",
  "Use an `OrchestrationPlan` when",
  "Every delegation must include a `CommandRequest`",
  "Collect child results as `ResultReport`s",
  "Do not assign work directly to grandchildren",
] as const

describe("task0263 soul execution boundary", () => {
  it("keeps detailed execution route and handoff rules outside soul", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const soul = readFileSync(join(promptsDir, "soul.md"), "utf-8")
    const knowbeeExecution = readFileSync(join(promptsDir, "knowbee-execution.md"), "utf-8")
    const subAgentDelegation = readFileSync(join(promptsDir, "sub_agent_delegation.md"), "utf-8")

    for (const detail of SOUL_FORBIDDEN_EXECUTION_DETAILS) {
      expect(soul).not.toContain(detail)
    }

    expect(soul).toContain("knowbee-execution.md")
    expect(soul).toContain("sub_agent_delegation.md")
    expect(soul).toContain("task_intake.md")
    expect(knowbeeExecution).toContain("## 5. Execution Order")
    expect(subAgentDelegation).toContain(
      "Every handoff must carry the goal, required context, constraints, completion criteria, and expected output through that schema.",
    )
  })
})
