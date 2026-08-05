export interface PromptAbstractCriterionBinding {
    term: string;
    ruleId: string;
    termSegmentIndex: number;
    criterionRuleId: string;
    criterionSegmentIndex: number;
    criterionKind: "decision_rule" | "example" | "test_criterion";
    criterionText: string;
    testOrFixtureRef: string;
}
export interface PromptSentenceResponsibility {
    sentenceId: string;
    ruleId: string;
    primaryResponsibilityIds: string[];
    actorRefs: string[];
    conditionRefs: string[];
    completionCriterionRefs: string[];
    parserConfidence: number;
}
export interface PromptDefinitionOwner {
    definitionKey: string;
    canonicalSourceId: string;
    canonicalRuleId: string;
}
export interface PromptDefinitionOccurrence {
    definitionKey: string;
    sourceId: string;
    occurrenceKind: "definition" | "reference";
    bodyFingerprint?: string;
    referencedRuleId?: string;
}
export type PromptDefinitionOwnershipIssueCode = "abstract_criterion_missing" | "abstract_criterion_not_immediate" | "abstract_criterion_rule_mismatch" | "sentence_multiple_responsibilities" | "sentence_multiple_execution_contexts" | "sentence_parser_confidence_low" | "definition_key_unknown" | "canonical_definition_missing" | "definition_owner_mismatch" | "definition_duplicate" | "canonical_reference_invalid";
export interface PromptDefinitionOwnershipIssue {
    code: PromptDefinitionOwnershipIssueCode;
    subjectId: string;
}
export type PromptDefinitionOwnershipDecision = {
    status: "eligible";
    definitionKeys: string[];
} | {
    status: "blocked";
    issues: PromptDefinitionOwnershipIssue[];
};
export declare function evaluatePromptDefinitionOwnership(input: {
    abstractBindings: PromptAbstractCriterionBinding[];
    sentences: PromptSentenceResponsibility[];
    owners: PromptDefinitionOwner[];
    occurrences: PromptDefinitionOccurrence[];
    minimumParserConfidence: number;
}): PromptDefinitionOwnershipDecision;
export declare function writeOwnershipEligiblePrompt<T>(input: {
    decision: PromptDefinitionOwnershipDecision;
    write: (decision: Extract<PromptDefinitionOwnershipDecision, {
        status: "eligible";
    }>) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | Extract<PromptDefinitionOwnershipDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-definition-ownership.d.ts.map