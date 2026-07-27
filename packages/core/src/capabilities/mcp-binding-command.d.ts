import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
export interface McpBindingCommandPorts {
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
    resolveMcp(mcpRef: string): {
        internalMcpId: string;
        active: boolean;
    } | null;
    resolveAgent(agentRef: string): {
        internalAgentId: string;
        name: string;
    } | null;
    bindingEnabled(input: {
        internalMcpId: string;
        internalAgentId: string;
    }): boolean;
    persist(input: {
        internalMcpId: string;
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
        internalMcpId: string;
        internalAgentId: string;
        enabled: boolean;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        internalMcpId: string;
        internalAgentId: string;
        enabled: boolean;
        baseRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
}
export interface McpBindingUserReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    mcpRef: string;
    agentRef: string;
    bound: boolean;
}
export declare function executeMcpBindingCommand(input: {
    envelope: MutationEnvelope;
    mcpRef: string;
    agentRef: string;
    action: "bind" | "unbind";
}, ports: McpBindingCommandPorts): Promise<McpBindingUserReceipt>;
//# sourceMappingURL=mcp-binding-command.d.ts.map