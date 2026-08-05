export interface PromptModuleResponsibilityManifest {
    moduleId: string;
    version: string;
    ownedResponsibilityIds: string[];
    allowedReferenceResponsibilityIds: string[];
}
export interface CanonicalPromptRuleOwner {
    ruleKey: string;
    moduleId: string;
    ruleId: string;
    responsibilityId: string;
    version: string;
    definitionFingerprint: string;
}
export interface PromptModuleRuleReference {
    sourceModuleId: string;
    targetModuleId: string;
    ruleKey: string;
    targetRuleId: string;
    targetResponsibilityId: string;
    expectedVersion: string;
    expectedDefinitionFingerprint: string;
    repeatsDefinitionBody: boolean;
}
export type PromptModuleReferenceIssueCode = "module_duplicate" | "module_unknown" | "canonical_owner_duplicate" | "canonical_owner_missing" | "definition_responsibility_out_of_scope" | "reference_responsibility_out_of_scope" | "reference_target_mismatch" | "reference_version_stale" | "reference_fingerprint_stale" | "reference_repeats_definition" | "reference_cycle";
export interface PromptModuleReferenceIssue {
    code: PromptModuleReferenceIssueCode;
    subjectId: string;
}
export type PromptModuleReferenceDecision = {
    status: "eligible";
    moduleIds: string[];
    ruleKeys: string[];
} | {
    status: "blocked";
    issues: PromptModuleReferenceIssue[];
};
export declare function evaluatePromptModuleReferenceGraph(input: {
    manifests: PromptModuleResponsibilityManifest[];
    owners: CanonicalPromptRuleOwner[];
    references: PromptModuleRuleReference[];
}): PromptModuleReferenceDecision;
export declare function writeReferenceEligiblePromptModules<T>(input: {
    decision: PromptModuleReferenceDecision;
    write: (decision: Extract<PromptModuleReferenceDecision, {
        status: "eligible";
    }>) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | Extract<PromptModuleReferenceDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-module-reference-graph.d.ts.map