import type { GoalNormativeClause } from "./goal-requirement-audit.js";
export declare function projectObligationChecksum(obligation: string): string;
export declare function buildExactEvidenceMigrationReport(input: {
    historicalClauses: readonly GoalNormativeClause[];
    projectClauses: readonly GoalNormativeClause[];
    historicalEvidenceRequirementIds: readonly string[];
}): {
    candidates: {
        projectRequirementId: string;
        historicalRequirementId: string;
    }[];
    unmatched: {
        requirementId: string;
        section: string;
    }[];
    sections: {
        section: string;
        count: number;
        requirementIds: string[];
    }[];
};
export declare function auditProjectEvidenceClaims(input: {
    requirements: ReadonlyArray<{
        requirementId: string;
        obligation: string;
    }>;
    entries: Record<string, {
        obligationChecksum?: string;
        evidence?: ReadonlyArray<{
            claimRefs?: readonly string[];
        }>;
    }>;
}): {
    complete: boolean;
    diagnostics: {
        code: "obligation_checksum_mismatch" | "evidence_claim_unbound";
        requirementId: string;
        evidenceIndex: number | null;
    }[];
};
//# sourceMappingURL=project-evidence-integrity.d.ts.map