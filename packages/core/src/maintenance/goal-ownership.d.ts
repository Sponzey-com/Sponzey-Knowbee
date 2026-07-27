export type GoalOwnershipResponsibilityKind = "document_ownership" | "product_behavior" | "prompt_authoring_contract" | "prompt_module_boundaries" | "handoff_schema" | "child_result_schema" | "prompt_improvement_flow" | "prompt_improvement_harness" | "acceptance_review" | "open_decisions";
export interface GoalOwnershipEntry {
    responsibilityId: string;
    chapter: string;
    responsibilityKind: GoalOwnershipResponsibilityKind;
    canonicalArtifact: string;
    allowedReferenceArtifacts: string[];
}
export interface GoalOwnershipDiagnostic {
    code: "ownership_responsibility_duplicate" | "ownership_chapter_duplicate" | "ownership_chapter_missing" | "ownership_chapter_kind_mismatch" | "ownership_artifact_missing" | "ownership_canonical_artifact_repeated_as_reference";
    responsibilityId: string;
    chapter: string;
    artifact: string;
}
export interface GoalOwnershipAuditResult {
    complete: boolean;
    state: "proven" | "contradicted" | "incomplete";
    diagnostics: GoalOwnershipDiagnostic[];
}
export type GoalDocumentRuleOccurrenceKind = "definition" | "reference";
export interface GoalDocumentRuleOccurrence {
    ruleKey: string;
    chapter: string;
    responsibilityKind: GoalOwnershipResponsibilityKind;
    occurrenceKind: GoalDocumentRuleOccurrenceKind;
}
export type GoalDocumentRuleOwnershipIssueCode = "rule_definition_duplicate" | "rule_wrong_owner_chapter" | "chapter4_responsibility_leak" | "responsibility_owner_missing";
export interface GoalDocumentRuleOwnershipDiagnostic {
    code: GoalDocumentRuleOwnershipIssueCode;
    ruleKey: string;
    chapter: string;
    expectedChapter: string;
    responsibilityKind: GoalOwnershipResponsibilityKind;
}
export interface GoalDocumentRuleOwnershipAuditResult {
    complete: boolean;
    state: "proven" | "contradicted" | "incomplete";
    diagnostics: GoalDocumentRuleOwnershipDiagnostic[];
}
export declare const REQUIRED_GOAL_OWNERSHIP_CHAPTERS: readonly ["2.1", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
export declare const GOAL_OWNERSHIP_CATALOG: readonly GoalOwnershipEntry[];
export declare function auditGoalRuleOwnership(input: {
    occurrences: readonly GoalDocumentRuleOccurrence[];
    catalog?: readonly GoalOwnershipEntry[];
}): GoalDocumentRuleOwnershipAuditResult;
export declare function auditGoalOwnership(input: {
    goalMarkdown: string;
    catalog?: readonly GoalOwnershipEntry[];
    artifactExists?: (artifact: string) => boolean;
}): GoalOwnershipAuditResult;
export declare function validateGoalOwnershipCatalog(catalog?: readonly GoalOwnershipEntry[]): GoalOwnershipAuditResult;
//# sourceMappingURL=goal-ownership.d.ts.map