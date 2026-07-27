export interface WorkBoundMemoryHandoff {
    handoffId: string;
    sourceAgentId: string;
    recipientAgentId: string;
    assignedWorkId: string;
    receiptWorkId: string;
    purpose: string;
    payloadFieldNames: string[];
    allowedPayloadFieldNames: string[];
    contextRefs: string[];
    allowedContextRefs: string[];
    provenanceRefs: string[];
    containsRawMemory: boolean;
    containsUnrelatedHistory: boolean;
    grantsLongTermRetention: boolean;
    expiresAt: number;
    evaluatedAt: number;
}
export type MemoryHandoffIssueCode = "handoff_owner_same" | "handoff_work_mismatch" | "handoff_purpose_missing" | "handoff_payload_field_not_allowed" | "handoff_context_ref_not_allowed" | "handoff_provenance_missing" | "handoff_raw_memory_forbidden" | "handoff_unrelated_history_forbidden" | "handoff_long_term_grant_forbidden" | "handoff_expired";
export interface ShortTermCompactionPolicySnapshot {
    tokenThreshold: number;
    messageThreshold: number;
    protectedRecentMessageCount: number;
    policyVersion: string;
}
export interface ShortTermHistorySegment {
    segmentId: string;
    ordinal: number;
    tokenEstimate: number;
    messageCount: number;
    pinned: boolean;
    activeWork: boolean;
    activeDelegation: boolean;
    unresolvedToolResult: boolean;
    provisionalDecision: boolean;
}
export type ShortTermCompactionDecision = {
    status: "eligible";
    candidateSegmentIds: string[];
    policyVersion: string;
} | {
    status: "no_op";
    reasonCode: "threshold_not_exceeded";
} | {
    status: "blocked";
    reasonCode: "no_safe_compaction_candidate";
};
export type MemoryHandoffDecision = {
    status: "eligible";
    handoffId: string;
} | {
    status: "blocked";
    issueCodes: MemoryHandoffIssueCode[];
};
export declare function evaluateWorkBoundMemoryHandoff(input: WorkBoundMemoryHandoff): MemoryHandoffDecision;
export declare function evaluateShortTermCompaction(input: {
    policy: ShortTermCompactionPolicySnapshot;
    currentTokenEstimate: number;
    currentMessageCount: number;
    segments: ShortTermHistorySegment[];
}): ShortTermCompactionDecision;
export declare function runEligibleMemoryOperation<T>(input: {
    eligible: boolean;
    run: () => Promise<T>;
}): Promise<{
    status: "executed";
    result: T;
} | {
    status: "blocked";
}>;
//# sourceMappingURL=memory-handoff-compaction.d.ts.map