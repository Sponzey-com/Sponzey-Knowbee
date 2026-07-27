import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const requirementIds = ["PRJ-b8a05737", "PRJ-9b803d67"]

describe("Task 095 PROJECT user method constraint evidence", () => {
  it("proves boundary preservation and exclusive-method switch consent", () => {
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
