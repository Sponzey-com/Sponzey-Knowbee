import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/self/audit-project-requirements.mjs"

describe("Task 078 PROJECT agent isolation evidence", () => {
  it("proves memory, Skill/MCP binding, and explicit handoff isolation", () => {
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })
    const requirement = result.audit.requirements.find(
      (item) => item.requirementId === "PRJ-fa7c1596",
    )

    expect(requirement?.status).toBe("proven")
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(73)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(96)
    expect(result.audit.counts.partial).toBe(0)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
