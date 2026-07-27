import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const requirementIds = ["PRJ-f1a28ceb", "PRJ-ec9c16c5", "PRJ-2c56ddf9"]

describe("Task 082 PROJECT runtime admission evidence", () => {
  it("proves structured plan candidates and just-in-time capability admission", () => {
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
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(85)
    expect(result.audit.counts.missing).toBeLessThanOrEqual(84)
    expect(result.audit.counts.partial).toBe(0)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
