export declare const PROMPT_IMPROVEMENT_INPUT_PROVENANCES: readonly ["prompt_source_file", "persistent_prompt_record", "user_chat_improvement_request", "user_chat_supporting_evidence"];
export declare const PLATFORM_PROMPT_PROTECTED_INVARIANTS: readonly ["product_identity", "safety_rules", "tool_boundary", "memory_isolation", "delegation_rules"];
export type PromptImprovementInputProvenance = typeof PROMPT_IMPROVEMENT_INPUT_PROVENANCES[number];
export type PlatformPromptProtectedInvariant = typeof PLATFORM_PROMPT_PROTECTED_INVARIANTS[number];
export type PromptBehaviorImpact = "no_user_visible_change" | "user_visible_behavior_change" | "capability_or_permission_change";
export interface PromptImprovementInputReference {
    provenance: PromptImprovementInputProvenance;
    reference: string;
    fingerprint: string;
}
export interface PlatformPromptInvariantReview {
    invariant: PlatformPromptProtectedInvariant;
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    decision: "preserved" | "changed" | "denied";
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
}
export interface PromptBehaviorChangeSummary {
    proposalFingerprint: string;
    targetAgentRef: string;
    beforeBehavior: string;
    afterBehavior: string;
    impactScope: string;
    riskSummary: string;
    rollbackSummary: string;
    fingerprint: string;
}
export interface PromptBehaviorConfirmationReceipt {
    schemaVersion: 1;
    confirmationId: string;
    proposalFingerprint: string;
    summaryFingerprint: string;
    actorRef: string;
    decision: "confirmed" | "denied";
    confirmedAt: number;
    expiresAt: number;
}
export type PromptImprovementApplicationGateDecision = {
    status: "authorized";
    proposalFingerprint: string;
    sourceRefs: string[];
    confirmationId?: string;
} | {
    status: "blocked";
    reasonCode: "prompt_source_missing" | "chat_used_as_prompt_source" | "invariant_review_incomplete" | "invariant_review_expired" | "invariant_scope_mismatch" | "invariant_not_preserved" | "behavior_summary_missing" | "behavior_summary_invalid" | "confirmation_missing" | "confirmation_denied" | "confirmation_expired" | "confirmation_scope_mismatch";
};
export declare function authorizePromptImprovementApplication(input: {
    proposalFingerprint: string;
    sourceInputs: PromptImprovementInputReference[];
    evidenceInputs?: PromptImprovementInputReference[];
    invariantReviews: PlatformPromptInvariantReview[];
    behaviorImpact: PromptBehaviorImpact;
    behaviorSummary?: PromptBehaviorChangeSummary;
    confirmation?: PromptBehaviorConfirmationReceipt;
    expectedConfirmationActorRef: string;
    now: number;
}): PromptImprovementApplicationGateDecision;
export declare function applyConfirmedPromptImprovement<T>(input: {
    decision: PromptImprovementApplicationGateDecision;
    apply: (decision: Extract<PromptImprovementApplicationGateDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Extract<PromptImprovementApplicationGateDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-improvement-application-gate.d.ts.map