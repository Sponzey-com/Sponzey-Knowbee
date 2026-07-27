import type { AgentMemoryOwnershipDecision } from "./agent-memory-ownership.js";
import type { CompactionPreservationDecision, LongTermMemoryMutationDecision } from "./long-term-memory-governance.js";
import type { MemoryHandoffDecision, WorkBoundMemoryHandoff } from "./memory-handoff-compaction.js";
import type { PlatformPromptInvariantReview } from "./prompt-improvement-application-gate.js";
export declare const PROMPT_MEMORY_EXCHANGE_METHODS: readonly ["message_payload", "approved_handoff_package"];
export type PromptMemoryExchangeMethod = typeof PROMPT_MEMORY_EXCHANGE_METHODS[number];
export interface PromptMemoryExchangeReceipt {
    schemaVersion: 1;
    exchangeId: string;
    method: PromptMemoryExchangeMethod;
    sourceAgentId: string;
    targetAgentId: string;
    payloadFingerprint: string;
    messageEvidenceRef?: string;
    approvalRef?: string;
    handoff?: WorkBoundMemoryHandoff;
    handoffDecision?: MemoryHandoffDecision;
}
export interface MemoryNamespaceSeparationReceipt {
    schemaVersion: 1;
    status: "verified";
    agentNamespaceIds: string[];
    userNamespaceIds: string[];
    evidenceRef: string;
}
export interface LongTermMemoryPolicyReceipt {
    schemaVersion: 1;
    storageNeedReviewRequired: boolean;
    sensitivityReviewRequired: boolean;
    userIntentReviewRequired: boolean;
    agentOwnerReviewRequired: boolean;
    policyFingerprint: string;
}
export type PromptMemoryExchangeDecision = {
    status: "verified";
    exchangeId: string;
    method: PromptMemoryExchangeMethod;
    sourceAgentId: string;
    targetAgentId: string;
    payloadFingerprint: string;
} | {
    status: "blocked";
    reasonCode: "exchange_receipt_invalid" | "exchange_method_invalid" | "exchange_owner_same" | "message_evidence_missing" | "handoff_approval_missing" | "handoff_receipt_missing" | "handoff_not_eligible" | "handoff_scope_mismatch";
};
export interface PromptImprovementMemoryInvariantReceipt {
    schemaVersion: 1;
    invariant: "memory_isolation";
    decision: "preserved";
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
    activeAgentIds: string[];
    exchangeIds: string[];
    namespaceEvidenceRef: string;
    policyFingerprint: string;
}
export type PromptImprovementMemoryInvariantDecision = {
    status: "authorized";
    receipt: PromptImprovementMemoryInvariantReceipt;
} | {
    status: "blocked";
    reasonCode: "memory_ownership_incomplete" | "memory_namespace_receipt_invalid" | "memory_namespace_mixed" | "memory_namespace_coverage_incomplete" | "memory_exchange_invalid" | "compaction_preservation_incomplete" | "long_term_policy_incomplete" | "long_term_mutation_ineligible" | "memory_review_lineage_invalid";
};
export type MemoryIsolationInvariantProjectionDecision = {
    status: "authorized";
    review: PlatformPromptInvariantReview;
} | {
    status: "blocked";
    reasonCode: "memory_review_receipt_invalid" | "memory_review_expired" | "memory_review_scope_mismatch" | "goal_section3_lineage_mismatch";
};
export declare function evaluatePromptMemoryExchangeReceipt(receipt: PromptMemoryExchangeReceipt): PromptMemoryExchangeDecision;
export declare function authorizePromptImprovementMemoryInvariant(input: {
    ownership: AgentMemoryOwnershipDecision;
    namespaceSeparation: MemoryNamespaceSeparationReceipt;
    exchanges: PromptMemoryExchangeReceipt[];
    compaction: CompactionPreservationDecision;
    longTermPolicy: LongTermMemoryPolicyReceipt;
    longTermMutations: LongTermMemoryMutationDecision[];
    proposalFingerprint: string;
    baselineFingerprint: string;
    proposedFingerprint: string;
    goalSection3Fingerprint: string;
    reviewerRef: string;
    reviewedAt: number;
    expiresAt: number;
}): PromptImprovementMemoryInvariantDecision;
export declare function projectMemoryIsolationInvariantReview(input: {
    receipt: PromptImprovementMemoryInvariantReceipt;
    expectedProposalFingerprint: string;
    currentGoalSection3Fingerprint: string;
    now: number;
}): MemoryIsolationInvariantProjectionDecision;
//# sourceMappingURL=prompt-improvement-memory-invariants.d.ts.map