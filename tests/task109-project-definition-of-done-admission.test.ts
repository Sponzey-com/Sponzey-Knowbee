import { describe, expect, it } from "vitest"
import { admitProjectDefinitionOfDone } from "../packages/core/src/contracts/project-definition-of-done-admission.ts"

const parentRequirementId = "PRJ-parent"
const childRequirementIds = ["PRJ-analysis", "PRJ-execution", "PRJ-terminal"]

function input() {
  return {
    parentRequirementId,
    expectedChildRequirementIds: childRequirementIds,
    requirementProofs: childRequirementIds.map((requirementId) => ({
      requirementId,
      status: "proven" as const,
    })),
    inventoryComplete: true,
    claimVerificationComplete: true,
    evidenceVerificationComplete: true,
    documentFingerprint: `sha256:${"a".repeat(64)}` as const,
  }
}

describe("Task 109 PROJECT Definition of Done admission", () => {
  it("admits an exact all-proven child set with complete audit integrity", () => {
    expect(admitProjectDefinitionOfDone(input())).toEqual({
      status: "complete",
      parentRequirementId,
      provenChildCount: 3,
      documentFingerprint: `sha256:${"a".repeat(64)}`,
    })
  })

  it("rejects missing, duplicate, unknown, or self-referential child proofs", () => {
    expect(
      admitProjectDefinitionOfDone({
        ...input(),
        requirementProofs: input().requirementProofs.slice(0, 2),
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["requirement_set_mismatch"] })
    expect(
      admitProjectDefinitionOfDone({
        ...input(),
        requirementProofs: [
          ...input().requirementProofs,
          { requirementId: "PRJ-analysis", status: "proven" },
        ],
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["requirement_proof_duplicate"] })
    expect(
      admitProjectDefinitionOfDone({
        ...input(),
        requirementProofs: [
          ...input().requirementProofs,
          { requirementId: "PRJ-unknown", status: "proven" },
        ],
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["requirement_set_mismatch"] })
    expect(
      admitProjectDefinitionOfDone({
        ...input(),
        expectedChildRequirementIds: [...childRequirementIds, parentRequirementId],
        requirementProofs: [
          ...input().requirementProofs,
          { requirementId: parentRequirementId, status: "proven" },
        ],
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["parent_requirement_self_reference"] })
  })

  it("rejects any non-proven child or incomplete audit integrity", () => {
    expect(
      admitProjectDefinitionOfDone({
        ...input(),
        requirementProofs: input().requirementProofs.map((proof, index) =>
          index === 1 ? { ...proof, status: "missing" as const } : proof,
        ),
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["child_requirement_not_proven"] })
    expect(
      admitProjectDefinitionOfDone({
        ...input(),
        inventoryComplete: false,
        claimVerificationComplete: false,
        evidenceVerificationComplete: false,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: [
        "inventory_incomplete",
        "claim_verification_incomplete",
        "evidence_verification_incomplete",
      ],
    })
  })
})
