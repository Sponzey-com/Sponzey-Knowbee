import { describe, expect, it } from "vitest"

import {
  auditProjectEvidenceClaims,
  buildExactEvidenceMigrationReport,
  projectObligationChecksum,
} from "../packages/core/src/maintenance/project-evidence-integrity.js"

describe("task008 PROJECT evidence integrity", () => {
  it("permits migration candidates only for exact normalized text", () => {
    const report = buildExactEvidenceMigrationReport({
      historicalClauses: [
        {
          clauseId: "1:old",
          section: "1",
          kind: "requirement",
          text: "Execute work.",
          sourceLine: 1,
        },
      ],
      projectClauses: [
        {
          clauseId: "new-a",
          section: "1",
          kind: "requirement",
          text: "Execute work.",
          sourceLine: 2,
        },
        {
          clauseId: "new-b",
          section: "2",
          kind: "requirement",
          text: "Execute the work.",
          sourceLine: 3,
        },
      ],
      historicalEvidenceRequirementIds: ["REQ-1:old"],
    })

    expect(report.candidates).toEqual([
      { projectRequirementId: "PRJ-new-a", historicalRequirementId: "REQ-1:old" },
    ])
    expect(report.unmatched).toEqual([{ requirementId: "PRJ-new-b", section: "2" }])
  })

  it("rejects mismatched obligation checksums and unbound evidence claims", () => {
    const checksum = projectObligationChecksum("Execute work.")
    const result = auditProjectEvidenceClaims({
      requirements: [{ requirementId: "PRJ-a", obligation: "Execute work." }],
      entries: {
        "PRJ-a": {
          obligationChecksum: "fnv1a:00000000",
          evidence: [{ claimRefs: [`obligation:${checksum}`] }, { claimRefs: [] }],
        },
      },
    })

    expect(result.complete).toBe(false)
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "evidence_claim_unbound",
      "obligation_checksum_mismatch",
    ])
  })

  it("groups unmatched requirements by section without clause text", () => {
    const report = buildExactEvidenceMigrationReport({
      historicalClauses: [],
      projectClauses: [
        { clauseId: "b", section: "2", kind: "requirement", text: "secret second", sourceLine: 2 },
        { clauseId: "a", section: "1", kind: "requirement", text: "secret first", sourceLine: 1 },
      ],
      historicalEvidenceRequirementIds: [],
    })

    expect(report.sections).toEqual([
      { section: "1", count: 1, requirementIds: ["PRJ-a"] },
      { section: "2", count: 1, requirementIds: ["PRJ-b"] },
    ])
    expect(JSON.stringify(report)).not.toContain("secret")
  })
})
