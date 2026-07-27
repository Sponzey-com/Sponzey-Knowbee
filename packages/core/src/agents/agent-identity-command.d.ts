export type AgentIdentityMutationKind = "create" | "update" | "archive";
export type AgentIdentityMutationState = "draft" | "validating" | "persisting" | "verifying" | "active" | "failed" | "conflict" | "cancelled";
export interface AgentIdentityMutationEnvelope {
    mutationId: string;
    nonce: string;
    actorRef: string;
    scope: "agent_identity";
}
export interface AgentIdentityRecord {
    agentRef: string;
    agentType: "knowbee" | "sub_agent";
    name: string;
    role: string;
    status: "enabled" | "disabled" | "archived" | "degraded";
    revision: number;
    activeChildCount: number;
    activeBindingCount: number;
}
export type AgentIdentityCommand = {
    kind: "create";
    envelope: AgentIdentityMutationEnvelope;
    name: string;
    role: string;
    modelName?: string;
} | {
    kind: "update";
    envelope: AgentIdentityMutationEnvelope;
    agentRef: string;
    baseRevision: number;
    name: string;
    role: string;
} | {
    kind: "archive";
    envelope: AgentIdentityMutationEnvelope;
    agentRef: string;
    baseRevision: number;
    confirmed: boolean;
};
export interface AgentIdentityMutationReceipt {
    mutationId: string;
    nonce: string;
    requestSignature: string;
    kind: AgentIdentityMutationKind;
    state: AgentIdentityMutationState;
    agentRef?: string;
    revision?: number;
    name?: string;
    role?: string;
    reasonCode?: string;
    impact?: {
        activeChildCount: number;
        activeBindingCount: number;
    };
    transitions: AgentIdentityMutationState[];
}
export interface AgentIdentityCommandRepository {
    receiptByNonce(nonce: string): AgentIdentityMutationReceipt | null;
    recordByRef(agentRef: string): AgentIdentityRecord | null;
    recordByNormalizedName(normalizedName: string): AgentIdentityRecord | null;
    create(input: {
        name: string;
        normalizedName: string;
        role: string;
        modelName?: string;
    }): AgentIdentityRecord | {
        reasonCode: string;
    };
    compareAndUpdate(input: {
        agentRef: string;
        baseRevision: number;
        name: string;
        normalizedName: string;
        role: string;
    }): AgentIdentityRecord | {
        reasonCode: string;
    };
    compareAndArchive(input: {
        agentRef: string;
        baseRevision: number;
    }): AgentIdentityRecord | {
        reasonCode: string;
    };
    saveReceipt(receipt: AgentIdentityMutationReceipt): void;
}
export declare function executeAgentIdentityCommand(command: AgentIdentityCommand, repository: AgentIdentityCommandRepository): AgentIdentityMutationReceipt;
export declare function publicAgentIdentityReceipt(receipt: AgentIdentityMutationReceipt): Omit<AgentIdentityMutationReceipt, "nonce" | "requestSignature">;
//# sourceMappingURL=agent-identity-command.d.ts.map