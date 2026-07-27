import { describe, expect, it } from "vitest"
import { admitProjectDefinitionOfDone } from "../packages/core/src/contracts/project-definition-of-done-admission.ts"
import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

const parentRequirementId = "PRJ-1b687577"

describe("Task 109 PROJECT Definition of Done evidence", () => {
  it("admits the real PROJECT audit only after all non-parent requirements are proven", () => {
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })
    const childRequirements = result.audit.requirements.filter(
      (requirement) => requirement.requirementId !== parentRequirementId,
    )
    const expectedChildCount = result.inventory.clauses.length - 1

    expect(result.audit.counts).toEqual({
      proven: result.inventory.clauses.length,
      partial: 0,
      missing: 0,
      contradicted: 0,
    })
    expect(childRequirements).toHaveLength(expectedChildCount)
    expect(
      admitProjectDefinitionOfDone({
        parentRequirementId,
        expectedChildRequirementIds: childRequirements.map(
          (requirement) => requirement.requirementId,
        ),
        requirementProofs: childRequirements.map((requirement) => ({
          requirementId: requirement.requirementId,
          status: requirement.status,
        })),
        inventoryComplete: result.inventory.complete,
        claimVerificationComplete: result.claimVerification.complete,
        evidenceVerificationComplete: result.evidenceVerification.complete,
        documentFingerprint: `sha256:${result.documentSha256}`,
      }),
    ).toMatchObject({
      status: "complete",
      parentRequirementId,
      provenChildCount: expectedChildCount,
    })
  })
})
