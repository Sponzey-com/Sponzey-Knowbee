export interface TokenEstimatorPort {
    readonly version: string;
    estimateTokens(text: string): number;
}
export interface WebResearchContextAllocations {
    readonly systemToolTokens: number;
    readonly conversationTokens: number;
    readonly webEvidenceTokens: number;
    readonly answerReserveTokens: number;
}
export interface WebResearchContextBudget {
    readonly modelContextTokens: number;
    readonly allocations: WebResearchContextAllocations;
    readonly estimatedUse: Readonly<{
        systemToolTokens: number;
        conversationTokens: number;
    }>;
    readonly unallocatedTokens: number;
    readonly estimatorVersion: string;
    readonly inputFingerprint: `sha256:${string}`;
    readonly fingerprint: `sha256:${string}`;
}
export type WebResearchContextBudgetResult = Readonly<{
    ok: true;
    value: WebResearchContextBudget;
}> | Readonly<{
    ok: false;
    reasonCode: "context_budget_input_invalid" | "context_budget_allocation_invalid" | "context_budget_web_cap_exceeded" | "context_budget_answer_reserve_too_small" | "context_budget_total_exceeded" | "context_budget_estimator_invalid" | "context_budget_input_exceeds_allocation";
}>;
export interface CreateWebResearchContextBudgetInput {
    readonly modelContextTokens: number;
    readonly systemToolText: string;
    readonly conversationText: string;
    readonly allocations?: Readonly<Partial<WebResearchContextAllocations>>;
}
export declare function createWebResearchContextBudget(input: CreateWebResearchContextBudgetInput, estimator: TokenEstimatorPort): WebResearchContextBudgetResult;
//# sourceMappingURL=web-research-context-budget.d.ts.map