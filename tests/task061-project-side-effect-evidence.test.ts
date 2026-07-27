import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const SIDE_EFFECT_REQUIREMENTS = ["PRJ-e8037551", "PRJ-eaffad2b", "PRJ-30cdcd1b"] as const

describe("Task 061 PROJECT side-effect evidence", () => {
  it("binds implemented side-effect safeguards to verified source and behavior owners", () => {
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

    expect(SIDE_EFFECT_REQUIREMENTS.map((id) => statuses.get(id))).toEqual([
      "proven",
      "proven",
      "proven",
    ])
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(27)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(142)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
