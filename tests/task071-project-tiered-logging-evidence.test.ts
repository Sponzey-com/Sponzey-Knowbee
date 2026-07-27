import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const REQUIREMENTS = ["PRJ-0664cfe4", "PRJ-363fd517", "PRJ-16761749"] as const

describe("Task 071 PROJECT three-purpose logging evidence", () => {
  it("proves minimal product, field-debug trace, and development diagnostic boundaries", () => {
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
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(58)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(111)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
