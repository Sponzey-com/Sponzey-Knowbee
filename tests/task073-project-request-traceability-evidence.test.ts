import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

describe("Task 073 PROJECT request traceability evidence", () => {
  it("proves correlated diagnosis, execution, review, recovery, and terminal replay", () => {
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })
    const requirement = result.audit.requirements.find(
      (item) => item.requirementId === "PRJ-bd12304c",
    )

    expect(requirement?.status).toBe("proven")
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(60)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(109)
    expect(result.audit.counts.partial).toBe(0)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
