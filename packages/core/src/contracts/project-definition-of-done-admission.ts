export type ProjectRequirementProofStatus = "proven" | "partial" | "missing" | "contradicted"

export interface ProjectRequirementProof {
  requirementId: string
  status: ProjectRequirementProofStatus
}

export type ProjectDefinitionOfDoneRejectionCode =
  | "definition_of_done_input_invalid"
  | "parent_requirement_self_reference"
  | "expected_child_requirement_duplicate"
  | "requirement_proof_duplicate"
  | "requirement_set_mismatch"
  | "child_requirement_not_proven"
  | "inventory_incomplete"
  | "claim_verification_incomplete"
  | "evidence_verification_incomplete"

export type ProjectDefinitionOfDoneAdmission =
  | {
      status: "complete"
      parentRequirementId: string
      provenChildCount: number
      documentFingerprint: `sha256:${string}`
    }
  | { status: "rejected"; reasonCodes: ProjectDefinitionOfDoneRejectionCode[] }

function normalized(value: string): string {
  return value.trim()
}

function hasDuplicate(values: string[]): boolean {
  return new Set(values).size !== values.length
}

function sameSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  if (leftSet.size !== rightSet.size) return false
  return [...leftSet].every((value) => rightSet.has(value))
}

export function admitProjectDefinitionOfDone(input: {
  parentRequirementId: string
  expectedChildRequirementIds: readonly string[]
  requirementProofs: readonly ProjectRequirementProof[]
  inventoryComplete: boolean
  claimVerificationComplete: boolean
  evidenceVerificationComplete: boolean
  documentFingerprint: `sha256:${string}`
}): ProjectDefinitionOfDoneAdmission {
  const parentRequirementId = normalized(input.parentRequirementId)
  const expectedIds = input.expectedChildRequirementIds.map(normalized)
  const proofIds = input.requirementProofs.map((proof) => normalized(proof.requirementId))
  if (
    !parentRequirementId ||
    expectedIds.length === 0 ||
    expectedIds.some((requirementId) => !requirementId) ||
    proofIds.some((requirementId) => !requirementId) ||
    !/^sha256:[a-f0-9]{64}$/u.test(input.documentFingerprint)
  ) {
    return { status: "rejected", reasonCodes: ["definition_of_done_input_invalid"] }
  }

  const reasonCodes: ProjectDefinitionOfDoneRejectionCode[] = []
  if (expectedIds.includes(parentRequirementId)) {
    reasonCodes.push("parent_requirement_self_reference")
  }
  if (hasDuplicate(expectedIds)) reasonCodes.push("expected_child_requirement_duplicate")
  if (hasDuplicate(proofIds)) reasonCodes.push("requirement_proof_duplicate")
  if (!sameSet(expectedIds, proofIds)) reasonCodes.push("requirement_set_mismatch")
  if (input.requirementProofs.some((proof) => proof.status !== "proven")) {
    reasonCodes.push("child_requirement_not_proven")
  }
  if (!input.inventoryComplete) reasonCodes.push("inventory_incomplete")
  if (!input.claimVerificationComplete) reasonCodes.push("claim_verification_incomplete")
  if (!input.evidenceVerificationComplete) reasonCodes.push("evidence_verification_incomplete")
  if (reasonCodes.length > 0) return { status: "rejected", reasonCodes }

  return {
    status: "complete",
    parentRequirementId,
    provenChildCount: proofIds.length,
    documentFingerprint: input.documentFingerprint,
  }
}
