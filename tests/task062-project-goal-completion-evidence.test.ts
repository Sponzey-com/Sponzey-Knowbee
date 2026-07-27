import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const REQUIREMENTS = [
  "PRJ-d3be9df6",
  "PRJ-8172a6df",
  "PRJ-4e945ec1",
  "PRJ-e2848229",
  "PRJ-6e0655ef",
] as const

describe("Task 062 PROJECT goal completion evidence", () => {
  it("proves that transport success remains evidence until LLM goal review passes", () => {
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
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(32)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(137)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
