export declare const AGENT_MEMORY_STORE_KINDS: readonly ["short_term", "long_term", "history"];
export type AgentMemoryStoreKind = typeof AGENT_MEMORY_STORE_KINDS[number];
export declare const SHORT_TERM_MEMORY_CATEGORIES: readonly ["current_conversation", "current_work", "recent_tool_result", "active_delegation", "provisional_judgment"];
export type ShortTermMemoryCategory = typeof SHORT_TERM_MEMORY_CATEGORIES[number];
export interface AgentMemoryOwner {
    agentId: string;
    lifecycle: "active" | "inactive";
}
export interface AgentMemoryStoreBinding {
    agentId: string;
    namespaceId: string;
    storeKind: AgentMemoryStoreKind;
    lifecycle: "active" | "retired";
}
export interface ShortTermMemoryEntryIntent {
    entryId: string;
    ownerAgentId: string;
    sourceOwnerAgentId: string;
    category: ShortTermMemoryCategory;
    scopeType: "session" | "run" | "work" | "delegation";
    scopeId: string;
    scopeLifecycle: "active" | "terminated";
}
export type AgentMemoryOwnershipIssueCode = "agent_owner_duplicate" | "memory_store_binding_missing" | "memory_store_binding_duplicate" | "memory_namespace_shared" | "memory_binding_owner_unknown" | "short_term_owner_unknown" | "short_term_source_owner_mismatch" | "short_term_category_invalid" | "short_term_scope_invalid" | "short_term_scope_terminated";
export interface AgentMemoryOwnershipIssue {
    code: AgentMemoryOwnershipIssueCode;
    subjectId: string;
    storeKind?: AgentMemoryStoreKind;
}
export type AgentMemoryOwnershipDecision = {
    status: "eligible";
    activeAgentIds: string[];
} | {
    status: "blocked";
    issues: AgentMemoryOwnershipIssue[];
};
export declare function evaluateAgentMemoryOwnership(input: {
    agents: AgentMemoryOwner[];
    bindings: AgentMemoryStoreBinding[];
    shortTermEntries: ShortTermMemoryEntryIntent[];
}): AgentMemoryOwnershipDecision;
export declare function writeAgentMemoryEntry<T>(input: {
    decision: AgentMemoryOwnershipDecision;
    write: (decision: Extract<AgentMemoryOwnershipDecision, {
        status: "eligible";
    }>) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | Extract<AgentMemoryOwnershipDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=agent-memory-ownership.d.ts.map