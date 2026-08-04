import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/self/audit-project-requirements.mjs"

const REQUIREMENTS = ["PRJ-72c7e05b", "PRJ-8c98e322", "PRJ-9bba72e8"] as const

describe("Task 064 PROJECT untrusted evidence isolation", () => {
  it("proves that external data cannot become policy or execution instructions", () => {
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })
    const statuses = new Map(
      result.audit.requirements.map((requirement) => [
        requirement.requirementId,
        requirement.status,
      ]),
    )

    expect(REQUIREMENTS.map((id) => statuses.get(id))).toEqual(REQUIREMENTS.map(() => "proven"))
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(38)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(131)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
