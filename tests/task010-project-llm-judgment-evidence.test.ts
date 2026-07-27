import { describe, expect, it } from "vitest"

import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const SECTION_REQUIREMENT_IDS = [
  "PRJ-07d0e12d",
  "PRJ-1abc515e",
  "PRJ-48f5bdea",
  "PRJ-e5905bd7",
  "PRJ-f3de3037",
  "PRJ-a502bdca",
  "PRJ-b34c21af",
  "PRJ-285e0e74",
  "PRJ-12a46e17",
  "PRJ-41bcf340",
  "PRJ-062088d2",
  "PRJ-438b05f7",
  "PRJ-f72c0ffa",
  "PRJ-11da42e4",
] as const

describe("task010 PROJECT LLM judgment evidence", () => {
  it("records only the section 2 and 2.0 obligations supported by current runtime evidence", () => {
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

    expect(Object.fromEntries(SECTION_REQUIREMENT_IDS.map((id) => [id, statuses.get(id)]))).toEqual(
      {
        "PRJ-07d0e12d": "proven",
        "PRJ-1abc515e": "proven",
        "PRJ-48f5bdea": "proven",
        "PRJ-e5905bd7": "proven",
        "PRJ-f3de3037": "proven",
        "PRJ-a502bdca": "proven",
        "PRJ-b34c21af": "proven",
        "PRJ-285e0e74": "proven",
        "PRJ-12a46e17": "proven",
        "PRJ-41bcf340": "proven",
        "PRJ-062088d2": "proven",
        "PRJ-438b05f7": "proven",
        "PRJ-f72c0ffa": "proven",
        "PRJ-11da42e4": "proven",
      },
    )
    expect(result.audit.counts.proven).toBeGreaterThanOrEqual(14)
    expect(result.audit.counts.contradicted).toBe(0)
    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
  })
})
