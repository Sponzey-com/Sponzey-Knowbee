export declare const RESPONSE_FEEDBACK_KINDS: readonly ["user_reaction", "repeated_request", "failure_pattern", "explanation_request", "satisfaction", "dissatisfaction"];
export declare const RESPONSE_STRATEGY_TARGETS: readonly ["request_analysis", "clarification", "solution_path", "failure_report", "next_action", "delegation_decision"];
export declare const RESPONSE_STRATEGY_PROTECTED_INVARIANTS: readonly ["user_name", "agent_name", "memory_isolation", "permission", "safety", "response_language"];
export type ResponseFeedbackKind = typeof RESPONSE_FEEDBACK_KINDS[number];
export type ResponseStrategyTarget = typeof RESPONSE_STRATEGY_TARGETS[number];
export type ResponseStrategyProtectedInvariant = typeof RESPONSE_STRATEGY_PROTECTED_INVARIANTS[number];
export interface ResponseFeedbackEvidenceReceipt {
    kind: ResponseFeedbackKind;
    sessionId: string;
    runId: string;
    observedBehavior: string;
    evidenceRef: string;
    confidence: "low" | "medium" | "high";
    diagnosedBy: "llm";
    observedAt: number;
}
export interface ResponseStrategyInvariantReceipt {
    invariant: ResponseStrategyProtectedInvariant;
    before: "preserved";
    after: "preserved" | "weakened";
    regressionPassed: boolean;
    evidenceRef: string;
}
export type ResponseFeedbackEvidenceDecision = {
    status: "verified";
    evidenceRefs: string[];
    feedbackKinds: ResponseFeedbackKind[];
} | {
    status: "blocked";
    reasonCode: "feedback_evidence_invalid" | "feedback_evidence_insufficient" | "feedback_evidence_ambiguous";
};
export type ResponseStrategyImprovementDecision = {
    status: "authorized";
    target: ResponseStrategyTarget;
    evidenceRefs: string[];
    protectedInvariants: readonly ResponseStrategyProtectedInvariant[];
} | {
    status: "blocked";
    reasonCode: "feedback_not_verified" | "strategy_target_invalid" | "strategy_target_mismatch" | "protected_invariant_missing" | "protected_invariant_weakened" | "protected_invariant_regression_failed";
    invariant?: ResponseStrategyProtectedInvariant;
};
export declare function verifyResponseFeedbackEvidence(receipts: readonly ResponseFeedbackEvidenceReceipt[]): ResponseFeedbackEvidenceDecision;
export declare function authorizeResponseStrategyImprovement(input: {
    feedback: ResponseFeedbackEvidenceDecision;
    proposalTarget: ResponseStrategyTarget;
    writerTarget: ResponseStrategyTarget;
    invariants: readonly ResponseStrategyInvariantReceipt[];
}): ResponseStrategyImprovementDecision;
export declare function applyAuthorizedResponseStrategyImprovement<T>(input: {
    decision: ResponseStrategyImprovementDecision;
    apply: (authorization: Extract<ResponseStrategyImprovementDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Extract<ResponseStrategyImprovementDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=response-strategy-improvement.d.ts.map