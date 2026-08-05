export declare const PROMPT_IMPROVEMENT_PROTECTED_INVARIANTS: readonly ["user_identity", "agent_identity", "memory_isolation", "permission", "safety", "response_language", "delegation_rules", "tool_boundary", "yeonjang_authorization"];
export type PromptImprovementProtectedInvariant = typeof PROMPT_IMPROVEMENT_PROTECTED_INVARIANTS[number];
export interface AgentPromptImprovementOwnershipSnapshot {
    schemaVersion: 1;
    agentId: string;
    agentName: string;
    agentType: "main" | "sub_agent";
    roleRefs: string[];
    promptSourceRefs: string[];
    policyRefs: string[];
    testFixtureRefs: string[];
    platformOwnedRefs: string[];
    reviewerAgentId: string;
    fingerprint: string;
    capturedAt: number;
}
export interface AgentPromptImprovementScope {
    roleRefs: string[];
    promptSourceRefs: string[];
    policyRefs: string[];
    testFixtureRefs: string[];
}
export interface PromptImprovementInvariantReview {
    invariant: PromptImprovementProtectedInvariant;
    baselineRef: string;
    proposedEffect: string;
    result: "preserved" | "weakened";
    regressionTestReceiptRef: string;
    regressionPassed: boolean;
}
export interface SubAgentPromptImprovementApprovalReceipt {
    schemaVersion: 1;
    approvalId: string;
    proposalFingerprint: string;
    ownershipFingerprint: string;
    invariantReviewFingerprint: string;
    reviewerAgentId: string;
    approvedAgentId: string;
    approvedPromptSourceRefs: string[];
    decision: "approved" | "denied";
    approvedAt: number;
    expiresAt: number;
}
export type AgentPromptImprovementAuthorizationDecision = {
    status: "authorized";
    agentType: "main" | "sub_agent";
    proposalFingerprint: string;
    authorization: "owner_invariant_review" | "parent_approval";
} | {
    status: "blocked";
    reasonCode: "ownership_snapshot_stale" | "ownership_fingerprint_mismatch" | "scope_not_owned" | "platform_scope_protected" | "invariant_review_incomplete" | "invariant_weakened" | "invariant_regression_failed" | "parent_approval_missing" | "parent_reviewer_mismatch" | "parent_self_review" | "parent_approval_denied" | "parent_approval_expired" | "parent_approval_scope_mismatch";
};
export declare function authorizeAgentPromptImprovement(input: {
    proposalFingerprint: string;
    expectedOwnershipFingerprint: string;
    invariantReviewFingerprint: string;
    ownership: AgentPromptImprovementOwnershipSnapshot;
    scope: AgentPromptImprovementScope;
    invariantReviews: PromptImprovementInvariantReview[];
    parentApproval?: SubAgentPromptImprovementApprovalReceipt;
    now: number;
    maxOwnershipAgeMs: number;
}): AgentPromptImprovementAuthorizationDecision;
export declare function applyAuthorizedAgentPromptImprovement<T>(input: {
    authorization: AgentPromptImprovementAuthorizationDecision;
    apply: () => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=agent-prompt-improvement-authorization.d.ts.map