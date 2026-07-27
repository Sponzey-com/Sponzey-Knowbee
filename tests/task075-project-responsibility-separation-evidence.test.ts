import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const REQUIREMENTS = ["PRJ-114efa52", "PRJ-70eddbb7", "PRJ-2898acbf"] as const

describe("Task 075 PROJECT responsibility separation evidence", () => {
  it("proves LLM meaning, adapter provenance, and harness binding boundaries", () => {
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })
    const statuses = new Map(
      result.audit.requirements.map((item) => [item.requirementId, item.status]),
    )

    expect(REQUIREMENTS.map((id) => statuses.get(id))).toEqual(REQUIREMENTS.map(() => "proven"))
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(66)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(103)
    expect(result.audit.counts.partial).toBe(0)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
