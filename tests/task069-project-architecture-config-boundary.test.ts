import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/self/audit-project-requirements.mjs"

const REQUIREMENTS = ["PRJ-02bce4a3", "PRJ-20cb1782", "PRJ-3de8dc57"] as const

describe("Task 069 PROJECT architecture and runtime boundary evidence", () => {
  it("proves inward dependencies, startup-only config capture, and no keyword semantic routing", () => {
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
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(52)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(117)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
