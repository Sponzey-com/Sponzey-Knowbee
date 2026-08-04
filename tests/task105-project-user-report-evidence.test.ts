import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/self/audit-project-requirements.mjs"

const requirementIds = [
  "PRJ-d9fa37ad",
  "PRJ-fd3e8562",
  "PRJ-6e119076",
  "PRJ-725ff19c",
  "PRJ-0d4d4f01",
  "PRJ-6471b3b7",
]

describe("Task 105 PROJECT user report evidence", () => {
  it("proves concise report facts and continuation over user deflection", () => {
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
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
