import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/self/audit-project-requirements.mjs"

const REQUIREMENT_IDS = ["PRJ-24db68fe", "PRJ-c3e4f932", "PRJ-1e71da40"] as const

describe("Task 083 PROJECT executable capability selection evidence", () => {
  it("proves LLM comparison is bound to current executable capability evidence", () => {
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })
    const requirements = result.audit.requirements.filter((item) =>
      REQUIREMENT_IDS.includes(item.requirementId as (typeof REQUIREMENT_IDS)[number]),
    )

    expect(requirements).toHaveLength(REQUIREMENT_IDS.length)
    expect(requirements.every((item) => item.status === "proven")).toBe(true)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
