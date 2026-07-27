import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const requirementIds = ["PRJ-4d4f17ab", "PRJ-598ebe3f", "PRJ-be057d97"]

describe("Task 080 PROJECT delegation tree evidence", () => {
  it("proves eligible direct-child delegation and parent-owned result handling", () => {
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })
    const requirements = result.audit.requirements.filter((item) =>
      requirementIds.includes(item.requirementId),
    )

    expect(requirements).toHaveLength(requirementIds.length)
    expect(requirements.every((item) => item.status === "proven")).toBe(true)
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(79)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(90)
    expect(result.audit.counts.partial).toBe(0)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
