import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const FORBIDDEN_SCHEMA_OWNERSHIP_MARKERS = [
  "`WorkHandoffPackage` required fields are",
  "`WorkHandoffPackage` required fields:",
  "`ChildWorkResult` required fields are",
  "`ChildWorkResult` required fields:",
  "Include goal, context, constraints, allowed tools",
] as const

describe("task0281 sub-agent parent merge prompt contract", () => {
  it("defines parent-child linking, merge, and redelegation behavior without owning schema fields", () => {
    const delegation = readFileSync(join(process.cwd(), "prompts", "sub_agent_delegation.md"), "utf-8")

    expect(delegation).toContain("Link every child work record to the parent work record")
    expect(delegation).toContain("Validate a returned child result before merging it into the parent work record.")
    expect(delegation).toContain("preserves evidence, assumptions, risks, missing information, and actions taken")
    expect(delegation).toContain("aggregate them by parent step")
    expect(delegation).toContain("keep each child agent's `agent_name` attribution")
    expect(delegation).toContain("Follow `result_review.md` for result sufficiency")
    expect(delegation).toContain("only after the reviewed disposition authorizes it")
    expect(delegation).toContain("must change at least one axis")
    expect(delegation).toContain("Do not ask a child agent to repeat completed child steps")
    expect(delegation).toContain("does not own handoff field names")

    for (const marker of FORBIDDEN_SCHEMA_OWNERSHIP_MARKERS) {
      expect(delegation).not.toContain(marker)
    }
  })
})
