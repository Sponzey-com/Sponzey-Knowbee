import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/self/audit-project-requirements.mjs"

const requirementIds = ["PRJ-6258742e", "PRJ-eea561c5", "PRJ-01c0801f"]

describe("Task 094 PROJECT failure alternative evidence", () => {
  it("proves LLM failure diagnosis, changed alternatives, and impact confirmation", () => {
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
