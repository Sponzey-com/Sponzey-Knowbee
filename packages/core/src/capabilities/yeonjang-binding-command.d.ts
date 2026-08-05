import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
export interface YeonjangBindingCommandPorts {
    now(): number;
    currentRevision(): number;
    nonceUsed(nonce: string): boolean;
    reserveReceipt(input: {
        envelope: MutationEnvelope;
        state: CapabilityMutationState;
        now: number;
    }): boolean;
    updateReceipt(input: {
        mutationId: string;
        state: CapabilityMutationState;
        reasonCode: string | null;
        now: number;
    }): void;
    resolveYeonjang(yeonjangRef: string): {
        internalInstanceId: string;
        runnable: boolean;
        scopeAllowed: boolean;
    } | null;
    resolveAgent(agentRef: string): {
        internalAgentId: string;
        scopeAllowed: boolean;
    } | null;
    bindingEnabled(input: {
        internalInstanceId: string;
        internalAgentId: string;
    }): boolean;
    persist(input: {
        internalInstanceId: string;
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
        internalInstanceId: string;
        internalAgentId: string;
        enabled: boolean;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        internalInstanceId: string;
        internalAgentId: string;
        enabled: boolean;
        baseRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
}
export interface YeonjangBindingReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    yeonjangRef: string;
    agentRef: string;
    bound: boolean;
}
export declare function executeYeonjangBindingCommand(input: {
    envelope: MutationEnvelope;
    yeonjangRef: string;
    agentRef: string;
    action: "bind" | "unbind";
}, ports: YeonjangBindingCommandPorts): Promise<YeonjangBindingReceipt>;
//# sourceMappingURL=yeonjang-binding-command.d.ts.map