import type { OwnerScope } from "../contracts/sub-agent-orchestration.js";
export type LongTermMemoryStorageNeed = "durable_user_fact" | "user_preference" | "project_fact" | "agent_learning" | "approved_child_result" | "trusted_setting";
export declare const LONG_TERM_MEMORY_CATEGORIES: readonly ["recurring_user_preference", "agent_role_knowledge", "confirmed_decision", "long_horizon_goal", "approved_work_context"];
export type LongTermMemoryCategory = typeof LONG_TERM_MEMORY_CATEGORIES[number];
export type LongTermMemorySensitivity = "not_sensitive" | "personal" | "internal" | "sensitive" | "secret";
export type LongTermMemoryUserIntent = "explicit_user_request" | "trusted_setting" | "parent_review_accepted" | "learning_event_approved" | "admin_review_approved";
export type LongTermMemoryWriteGateIssueCode = "target_owner_missing" | "target_owner_mismatch" | "target_owner_not_writable" | "storage_need_missing" | "storage_need_invalid" | "category_missing" | "category_invalid" | "sensitivity_missing" | "sensitivity_invalid" | "sensitivity_blocked" | "user_intent_missing" | "user_intent_invalid" | "source_evidence_missing" | "retention_purpose_missing";
export interface LongTermMemoryWriteGateInput {
    targetOwner: OwnerScope;
    category: LongTermMemoryCategory;
    storageNeed: LongTermMemoryStorageNeed;
    sensitivity: LongTermMemorySensitivity;
    userIntent: LongTermMemoryUserIntent;
    sourceEvidenceRefs: string[];
    retentionPurpose: string;
}
export interface LongTermMemoryWriteGateDecision {
    ok: boolean;
    issueCodes: LongTermMemoryWriteGateIssueCode[];
    targetOwnerScopeKey?: string;
    category?: LongTermMemoryCategory;
    storageNeed?: LongTermMemoryStorageNeed;
    sensitivity?: LongTermMemorySensitivity;
    userIntent?: LongTermMemoryUserIntent;
    sourceEvidenceRefs: string[];
    retentionPurpose?: string;
}
export declare function longTermMemoryOwnerScopeKey(owner: OwnerScope): string;
export declare function validateLongTermMemoryWriteGate(input: LongTermMemoryWriteGateInput, options?: {
    expectedOwner?: OwnerScope;
}): LongTermMemoryWriteGateDecision;
//# sourceMappingURL=long-term-write-gate.d.ts.map