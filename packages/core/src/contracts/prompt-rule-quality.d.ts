export interface ExecutablePromptRuleStatement {
    ruleId: string;
    actorRef: string;
    condition: string;
    requiredActions: string[];
    prohibitedActions: string[];
    completionCriterion: string;
    sourceLine: number;
    clauseCount: number;
}
export interface PromptRuleQualityLimits {
    maxStatementCharacters: number;
    maxClauses: number;
    maxActions: number;
}
export type PromptRuleQualityIssueCode = "actor_missing" | "condition_missing" | "action_missing" | "action_conflict" | "completion_criterion_missing" | "statement_too_long" | "clause_limit_exceeded" | "action_limit_exceeded" | "duplicate_action";
export interface PromptRuleQualityIssue {
    ruleId: string;
    sourceLine: number;
    code: PromptRuleQualityIssueCode;
    expected?: number;
    actual?: number;
}
export type PromptRuleQualityDecision = {
    status: "eligible";
    ruleIds: string[];
} | {
    status: "blocked";
    issues: PromptRuleQualityIssue[];
};
export declare function evaluatePromptRuleQuality(input: {
    statements: ExecutablePromptRuleStatement[];
    limits: PromptRuleQualityLimits;
}): PromptRuleQualityDecision;
export declare function writeQualityEligiblePromptRules<T>(input: {
    decision: PromptRuleQualityDecision;
    write: (decision: Extract<PromptRuleQualityDecision, {
        status: "eligible";
    }>) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | Extract<PromptRuleQualityDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-rule-quality.d.ts.map