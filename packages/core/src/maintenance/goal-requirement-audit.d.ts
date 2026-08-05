export type GoalEvidenceKind = "authoritative_source" | "positive_test" | "rejection_test" | "contradiction";
export interface GoalRequirementEvidence {
    kind: GoalEvidenceKind;
    owner: string;
    assertions: string[];
    coveredScopes: string[];
    markers?: string[];
}
export interface GoalEvidenceOwnerVerification {
    complete: boolean;
    diagnostics: Array<{
        code: "evidence_owner_missing" | "evidence_owner_kind_mismatch" | "evidence_marker_missing";
        requirementId: string;
        owner: string;
        marker: string;
    }>;
}
export interface GoalRequirementRecord {
    requirementId: string;
    clauses: string[];
    obligation: string;
    requiredScopes: string[];
    evidence: GoalRequirementEvidence[];
}
export type GoalClauseKind = "requirement" | "review_criterion" | "open_decision";
export interface GoalNormativeClause {
    clauseId: string;
    section: string;
    kind: GoalClauseKind;
    text: string;
    sourceLine: number;
}
export interface GoalClauseInventory {
    complete: boolean;
    clauses: GoalNormativeClause[];
    diagnostics: Array<{
        code: "clause_id_collision" | "clause_without_numbered_section";
        section: string;
        sourceLines: number[];
    }>;
}
export type GoalRequirementAuditStatus = "proven" | "partial" | "missing" | "contradicted";
export interface GoalRequirementAuditResult {
    complete: boolean;
    counts: Record<GoalRequirementAuditStatus, number>;
    requirements: Array<{
        requirementId: string;
        status: GoalRequirementAuditStatus;
        reasonCodes: string[];
    }>;
    diagnostics: Array<{
        code: "clause_owned_multiple_times" | "clause_unowned" | "record_clause_unknown";
        clause: string;
        owners: string[];
    }>;
}
export declare function extractGoalNormativeClauses(markdown: string): GoalClauseInventory;
export declare function extractProjectNormativeClauses(markdown: string): GoalClauseInventory;
export declare function createGoalRequirementSkeleton(clauses: GoalNormativeClause[]): GoalRequirementRecord[];
export declare function createProjectRequirementSkeleton(clauses: GoalNormativeClause[]): GoalRequirementRecord[];
export declare function verifyGoalEvidenceOwners(input: {
    records: GoalRequirementRecord[];
    readOwner: (owner: string) => string | undefined;
}): GoalEvidenceOwnerVerification;
export declare function auditGoalRequirementMatrix(input: {
    normativeClauses: string[];
    records: GoalRequirementRecord[];
}): GoalRequirementAuditResult;
//# sourceMappingURL=goal-requirement-audit.d.ts.map