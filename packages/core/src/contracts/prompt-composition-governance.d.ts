export declare const AMBIGUOUS_PROMPT_PHRASES: readonly ["appropriately", "as needed", "if necessary", "later", "handle properly"];
export interface PromptRuleDescriptor {
    ruleId: string;
    moduleId: string;
    actor: string;
    condition: string;
    allowedActions: readonly string[];
    prohibitedActions: readonly string[];
    completionCriteria: readonly string[];
}
export interface CanonicalPromptOwner {
    responsibilityId: string;
    ownerModuleId: string;
}
export interface PromptResponsibilityUse {
    responsibilityId: string;
    moduleId: string;
    mode: "definition" | "reference";
    referencedOwnerModuleId?: string;
}
export interface PromptCompositionModule {
    moduleId: string;
    rules: readonly PromptRuleDescriptor[];
    responsibilities: readonly PromptResponsibilityUse[];
}
export type PromptGovernanceReasonCode = "prompt_rule_invalid" | "prompt_rule_ambiguous" | "canonical_owner_invalid" | "canonical_responsibility_unknown" | "canonical_definition_owner_mismatch" | "canonical_reference_owner_mismatch" | "prompt_module_duplicate" | "prompt_rule_duplicate" | "canonical_definition_duplicate";
export type PromptGovernanceDecision = {
    status: "authorized";
    moduleIds: string[];
    responsibilityIds: string[];
} | {
    status: "blocked";
    reasonCode: PromptGovernanceReasonCode;
    subjectId?: string;
};
export declare function validatePromptRuleClarity(rule: PromptRuleDescriptor): PromptGovernanceDecision;
export declare function validateCanonicalPromptUses(input: {
    owners: readonly CanonicalPromptOwner[];
    uses: readonly PromptResponsibilityUse[];
}): PromptGovernanceDecision;
export declare function authorizePromptComposition(input: {
    owners: readonly CanonicalPromptOwner[];
    modules: readonly PromptCompositionModule[];
}): PromptGovernanceDecision;
export declare function composeAuthorizedPrompts<T>(input: {
    decision: PromptGovernanceDecision;
    compose: (authorization: Extract<PromptGovernanceDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "composed";
    result: T;
} | Extract<PromptGovernanceDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-composition-governance.d.ts.map