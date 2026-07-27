import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task0262 planner execution decision boundary", () => {
  it("keeps execution route policy out of planner brief templates", () => {
    const planner = readFileSync(join(process.cwd(), "prompts", "planner.md"), "utf-8")

    expect(planner).toContain("Detailed execution decision")
    expect(planner).toContain("knowbee-execution.md")
    expect(planner).toContain("Execution route policy: follow `knowbee-execution.md`")
    expect(planner).toContain("Route input summary")
    expect(planner).not.toContain("Execution order: delegate -> self_solve")
    expect(planner).not.toContain("Selected action: <delegate | self_solve")
    expect(planner).not.toContain("Delegation decision: <must_delegate | self_solve")
  })
})
