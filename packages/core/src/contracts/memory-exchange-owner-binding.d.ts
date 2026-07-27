import type { OwnerScope } from "./sub-agent-orchestration.js";
export type MemoryExchangeOwnerBindingReasonCode = "memory_exchange_owner_binding_valid" | "memory_exchange_source_owner_invalid" | "memory_exchange_source_owner_mismatch" | "memory_exchange_recipient_owner_mismatch" | "memory_exchange_same_owner_forbidden" | "memory_exchange_provenance_invalid";
export interface MemoryExchangeOwnerBindingInput {
    commandOwner: OwnerScope;
    sourceOwner: OwnerScope;
    recipientOwner: OwnerScope;
    targetAgentId: string;
    handoffId: string;
    executionSnapshotFingerprint: string;
}
export type MemoryExchangeOwnerBindingDecision = {
    allowed: true;
    reasonCode: "memory_exchange_owner_binding_valid";
    provenanceRefs: string[];
} | {
    allowed: false;
    reasonCode: Exclude<MemoryExchangeOwnerBindingReasonCode, "memory_exchange_owner_binding_valid">;
    provenanceRefs: [];
};
export declare function evaluateMemoryExchangeOwnerBinding(input: MemoryExchangeOwnerBindingInput): MemoryExchangeOwnerBindingDecision;
//# sourceMappingURL=memory-exchange-owner-binding.d.ts.map