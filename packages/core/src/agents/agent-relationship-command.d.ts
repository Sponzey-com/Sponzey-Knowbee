import { type CapabilityMutationState } from "../capabilities/capability-mutation-state-machine.js";
import { type MutationEnvelope } from "../capabilities/capability-security-boundary.js";
export type AgentRelationshipMutationKind = "connect" | "reparent" | "disconnect";
export interface AgentRelationshipMutationReceipt {
    mutationId: string;
    kind: AgentRelationshipMutationKind;
    state: CapabilityMutationState | "rejected" | "conflict";
    reasonCode: string | null;
    revision: number;
    childRef: string;
    parentRef: string | null;
    allowedActions: readonly string[];
}
export interface AgentRelationshipCommandInput {
    kind: AgentRelationshipMutationKind;
    childRef: string;
    parentRef: string | null;
    envelope: MutationEnvelope;
}
interface CurrentRelationship {
    internalEdgeId: string;
    internalParentAgentId: string;
    active: boolean;
    sortOrder: number;
}
export interface AgentRelationshipCommandPorts {
    now(): number;
    currentRevision(): number;
    receiptByNonce(nonce: string): {
        mutationId: string;
        requestFingerprint: string;
        receipt: AgentRelationshipMutationReceipt;
    } | null;
    reserveReceipt(input: {
        envelope: MutationEnvelope;
        kind: AgentRelationshipMutationKind;
        requestFingerprint: string;
        state: CapabilityMutationState;
        now: number;
    }): boolean;
    finishReceipt(input: {
        mutationId: string;
        state: CapabilityMutationState;
        reasonCode: string | null;
        receipt: AgentRelationshipMutationReceipt;
        now: number;
    }): void;
    resolveAgent(agentRef: string): {
        internalAgentId: string;
        active: boolean;
        root: boolean;
    } | null;
    currentRelationship(internalChildAgentId: string): CurrentRelationship | null;
    validate(input: {
        kind: AgentRelationshipMutationKind;
        internalChildAgentId: string;
        internalParentAgentId: string | null;
        current: CurrentRelationship | null;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    persist(input: {
        kind: AgentRelationshipMutationKind;
        internalChildAgentId: string;
        internalParentAgentId: string | null;
        current: CurrentRelationship | null;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
    };
    verify(input: {
        internalChildAgentId: string;
        internalParentAgentId: string | null;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        internalChildAgentId: string;
        previous: CurrentRelationship | null;
        baseRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
}
export declare function executeAgentRelationshipCommand(command: AgentRelationshipCommandInput, ports: AgentRelationshipCommandPorts): Promise<AgentRelationshipMutationReceipt>;
export {};
//# sourceMappingURL=agent-relationship-command.d.ts.map