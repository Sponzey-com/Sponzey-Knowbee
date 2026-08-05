import { type AgentRelationship, type AgentStatus, type DelegationPolicy } from "../contracts/sub-agent-orchestration.js";
export interface DelegationForestAgent {
    agentId: string;
    agentName: string;
    agentType: "knowbee" | "sub_agent";
    status: AgentStatus;
    delegationPolicy?: DelegationPolicy;
}
export interface DelegationForestSnapshot {
    rootAgentId: string;
    agents: DelegationForestAgent[];
    relationships: AgentRelationship[];
    rootAgentIds: string[];
    directChildAgentIdsByParent: Record<string, string[]>;
    snapshotFingerprint: string;
}
export type DelegationForestDenialReason = "snapshot_fingerprint_mismatch" | "caller_unknown" | "target_unknown" | "caller_inactive" | "target_inactive" | "target_not_direct_child" | "delegation_disabled" | "redelegation_denied" | "direct_child_policy_required" | "target_not_allowed";
export type DelegationForestAuthorization = {
    ok: true;
    authorizationReceiptId: string;
    snapshotFingerprint: string;
    callerAgentName: string;
    targetAgentName: string;
} | {
    ok: false;
    reasonCode: DelegationForestDenialReason;
};
export declare function validateDelegationForestSnapshot(input: {
    rootAgentId: string;
    agents: DelegationForestAgent[];
    relationships: AgentRelationship[];
}): DelegationForestSnapshot;
export declare function authorizeDelegationInForest(input: {
    snapshot: DelegationForestSnapshot;
    expectedSnapshotFingerprint: string;
    callerAgentId: string;
    targetAgentId: string;
}): DelegationForestAuthorization;
//# sourceMappingURL=delegation-forest.d.ts.map