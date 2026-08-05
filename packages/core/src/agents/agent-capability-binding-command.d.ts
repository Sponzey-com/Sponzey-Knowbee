import { type CapabilityMutationState } from "../capabilities/capability-mutation-state-machine.js";
import { type MutationEnvelope } from "../capabilities/capability-security-boundary.js";
import type { AgentCapabilityKind } from "./agent-capability-binding-projection.js";
export interface AgentCapabilityBindingReceipt {
    mutationId: string;
    kind: AgentCapabilityKind;
    state: CapabilityMutationState | "rejected" | "conflict";
    reasonCode: string | null;
    revision: number;
    agentRef: string;
    capabilityRef: string;
    bound: boolean;
    allowedActions: readonly string[];
}
export interface AgentCapabilityBindingCommandPorts {
    now(): number;
    currentRevision(kind: AgentCapabilityKind): number;
    receiptByNonce(nonce: string): {
        mutationId: string;
        requestFingerprint: string;
        receipt: AgentCapabilityBindingReceipt;
    } | null;
    reserveReceipt(input: {
        envelope: MutationEnvelope;
        kind: AgentCapabilityKind;
        requestFingerprint: string;
        state: CapabilityMutationState;
        now: number;
    }): boolean;
    finishReceipt(input: {
        mutationId: string;
        state: CapabilityMutationState;
        reasonCode: string | null;
        receipt: AgentCapabilityBindingReceipt;
        now: number;
    }): void;
    resolveCapability(kind: AgentCapabilityKind, capabilityRef: string): {
        internalCapabilityId: string;
        active: boolean;
    } | null;
    resolveAgent(agentRef: string): {
        internalAgentId: string;
        active: boolean;
    } | null;
    bindingEnabled(input: {
        kind: AgentCapabilityKind;
        internalCapabilityId: string;
        internalAgentId: string;
    }): boolean;
    persist(input: {
        kind: AgentCapabilityKind;
        internalCapabilityId: string;
        internalAgentId: string;
        enabled: boolean;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
    };
    verify(input: {
        kind: AgentCapabilityKind;
        internalCapabilityId: string;
        internalAgentId: string;
        enabled: boolean;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        kind: AgentCapabilityKind;
        internalCapabilityId: string;
        internalAgentId: string;
        enabled: boolean;
        baseRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
}
export interface AgentCapabilityBindingCommandInput {
    envelope: MutationEnvelope;
    kind: AgentCapabilityKind;
    agentRef: string;
    capabilityRef: string;
    bound: boolean;
}
export declare function executeAgentCapabilityBindingCommand(command: AgentCapabilityBindingCommandInput, ports: AgentCapabilityBindingCommandPorts): Promise<AgentCapabilityBindingReceipt>;
//# sourceMappingURL=agent-capability-binding-command.d.ts.map