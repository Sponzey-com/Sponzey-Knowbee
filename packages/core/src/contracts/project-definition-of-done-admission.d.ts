export type ProjectRequirementProofStatus = "proven" | "partial" | "missing" | "contradicted";
export interface ProjectRequirementProof {
    requirementId: string;
    status: ProjectRequirementProofStatus;
}
export type ProjectDefinitionOfDoneRejectionCode = "definition_of_done_input_invalid" | "parent_requirement_self_reference" | "expected_child_requirement_duplicate" | "requirement_proof_duplicate" | "requirement_set_mismatch" | "child_requirement_not_proven" | "inventory_incomplete" | "claim_verification_incomplete" | "evidence_verification_incomplete";
export type ProjectDefinitionOfDoneAdmission = {
    status: "complete";
    parentRequirementId: string;
    provenChildCount: number;
    documentFingerprint: `sha256:${string}`;
} | {
    status: "rejected";
    reasonCodes: ProjectDefinitionOfDoneRejectionCode[];
};
export declare function admitProjectDefinitionOfDone(input: {
    parentRequirementId: string;
    expectedChildRequirementIds: readonly string[];
    requirementProofs: readonly ProjectRequirementProof[];
    inventoryComplete: boolean;
    claimVerificationComplete: boolean;
    evidenceVerificationComplete: boolean;
    documentFingerprint: `sha256:${string}`;
}): ProjectDefinitionOfDoneAdmission;
//# sourceMappingURL=project-definition-of-done-admission.d.ts.map