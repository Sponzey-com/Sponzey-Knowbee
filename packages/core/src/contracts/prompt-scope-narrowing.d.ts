export type PromptModuleRuleKind = "policy" | "exception" | "procedure" | "reference";
export interface PromptModuleRuleBoundary {
    ruleKey: string;
    moduleId: string;
    kind: PromptModuleRuleKind;
    responsibilityId: string;
    moduleOwnedResponsibilityIds: string[];
    canonicalOwnerModuleId: string;
}
export interface PromptRuleConsolidationReceipt {
    semanticRuleKey: string;
    canonicalOwnerModuleId: string;
    activeDefinitionModuleIds: string[];
    removedDuplicateModuleIds: string[];
    updatedConsumerReferenceModuleIds: string[];
    unresolvedConflictModuleIds: string[];
}
export interface PromptSemanticScope {
    actorRefs: string[];
    targetRefs: string[];
    permissionRefs: string[];
    exceptionRefs: string[];
    dataAccessRefs: string[];
    conditionStrictness: number;
    parserConfidence: number;
    fingerprint: string;
}
export type PromptScopeNarrowingIssueCode = "module_rule_out_of_scope" | "module_rule_owner_mismatch" | "consolidation_definition_count_invalid" | "consolidation_conflict_unresolved" | "consolidation_reference_update_missing" | "semantic_parser_confidence_low" | "semantic_scope_broadened" | "semantic_condition_weakened";
export interface PromptScopeNarrowingIssue {
    code: PromptScopeNarrowingIssueCode;
    subjectId: string;
    dimension?: "actor" | "target" | "permission" | "exception" | "data_access" | "condition";
}
export type PromptScopeNarrowingDecision = {
    status: "eligible";
    semanticScopeFingerprint: string;
} | {
    status: "blocked";
    issues: PromptScopeNarrowingIssue[];
};
export declare function evaluatePromptScopeNarrowing(input: {
    rules: PromptModuleRuleBoundary[];
    consolidations: PromptRuleConsolidationReceipt[];
    baselineScope: PromptSemanticScope;
    proposedScope: PromptSemanticScope;
    minimumParserConfidence: number;
}): PromptScopeNarrowingDecision;
export declare function writeNarrowedPromptScope<T>(input: {
    decision: PromptScopeNarrowingDecision;
    write: (decision: Extract<PromptScopeNarrowingDecision, {
        status: "eligible";
    }>) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | Extract<PromptScopeNarrowingDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-scope-narrowing.d.ts.map