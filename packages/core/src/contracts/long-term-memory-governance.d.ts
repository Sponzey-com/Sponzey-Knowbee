export type LongTermMemoryMutationAction = "create" | "update" | "delete";
export interface LongTermMemoryMutationReview {
    mutationId: string;
    action: LongTermMemoryMutationAction;
    requesterAgentId: string;
    targetAgentId: string;
    expectedTargetAgentId: string;
    targetNamespaceId: string;
    storageNeedReviewed: boolean;
    sensitivity: "not_sensitive" | "personal" | "internal" | "sensitive" | "secret";
    userIntent: "explicit_user_request" | "trusted_setting" | "parent_review_accepted" | "learning_event_approved" | "admin_review_approved";
    evidenceRefs: string[];
    reviewerRef: string;
    crossAgentAuthorizationRef?: string;
}
export type LongTermMemoryMutationIssueCode = "mutation_owner_mismatch" | "mutation_namespace_owner_mismatch" | "mutation_storage_need_unreviewed" | "mutation_secret_blocked" | "mutation_evidence_missing" | "mutation_reviewer_missing" | "mutation_cross_agent_unauthorized";
export type LongTermMemoryMutationDecision = {
    status: "eligible";
    mutationId: string;
    action: LongTermMemoryMutationAction;
    targetAgentId: string;
    targetNamespaceId: string;
} | {
    status: "blocked";
    issueCodes: LongTermMemoryMutationIssueCode[];
};
export declare const COMPACTION_PRESERVATION_CATEGORIES: readonly ["goals", "constraints", "decisions", "unresolved_questions", "evidence", "user_preferences", "active_work_state"];
export type CompactionPreservationCategory = typeof COMPACTION_PRESERVATION_CATEGORIES[number];
export interface CompactionPreservationEntry {
    category: CompactionPreservationCategory;
    sourceRefs: string[];
    outputRefs: string[];
    explicitEmpty: boolean;
}
export type CompactionPreservationDecision = {
    status: "eligible";
    preservedCategories: CompactionPreservationCategory[];
} | {
    status: "blocked";
    missingCategories: CompactionPreservationCategory[];
    unpreservedCategories: CompactionPreservationCategory[];
};
export declare function evaluateLongTermMemoryMutation(input: LongTermMemoryMutationReview): LongTermMemoryMutationDecision;
export declare function evaluateCompactionPreservation(entries: CompactionPreservationEntry[]): CompactionPreservationDecision;
export declare function executeEligibleMemoryGovernance<T>(input: {
    eligible: boolean;
    execute: () => Promise<T>;
}): Promise<{
    status: "executed";
    result: T;
} | {
    status: "blocked";
}>;
//# sourceMappingURL=long-term-memory-governance.d.ts.map