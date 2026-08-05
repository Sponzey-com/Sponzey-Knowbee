import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/self/audit-project-requirements.mjs"

describe("Task 072 PROJECT log privacy evidence", () => {
  it("proves secrets, internal prompts, and private memory cannot enter any log purpose", () => {
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })
    const requirement = result.audit.requirements.find(
      (item) => item.requirementId === "PRJ-8d4f19d8",
    )

    expect(requirement?.status).toBe("proven")
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(59)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(110)
    expect(result.audit.counts.partial).toBe(0)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
