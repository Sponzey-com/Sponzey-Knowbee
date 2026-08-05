import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const INTAKE_FORBIDDEN_ROUTE_DETAILS = [
  "sub_agent/delegate_to_child -> yeonjang -> self_solve",
  "root_knowbee_direct",
  "First evaluate a suitable direct child executor",
  "Use self_solve when the current agent can handle the work directly",
] as const

describe("task0261 task intake execution route boundary", () => {
  it("keeps execution route ordering outside task_intake", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const taskIntake = readFileSync(join(promptsDir, "task_intake.md"), "utf-8")
    const knowbeeExecution = readFileSync(join(promptsDir, "knowbee-execution.md"), "utf-8")

    for (const detail of INTAKE_FORBIDDEN_ROUTE_DETAILS) {
      expect(taskIntake).not.toContain(detail)
    }

    expect(taskIntake).toContain("knowbee-execution.md")
    expect(taskIntake).toContain("action_items")
    expect(knowbeeExecution).toContain("self_solve")
    expect(knowbeeExecution).toContain("direct children")
  })
})
