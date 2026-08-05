import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
import type { McpConnectionDraft } from "./mcp-connection-validation.js";
export type McpLifecycleAction = "enable" | "disable" | "delete";
export interface McpLifecycleSnapshot {
    internalMcpId: string;
    mcpRef: string;
    displayName: string;
    status: "enabled" | "disabled";
    draft: McpConnectionDraft;
    revision: number;
}
export interface McpLifecycleCommandPorts {
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
    resolveMcp(mcpRef: string): McpLifecycleSnapshot | null;
    boundAgentNames(internalMcpId: string): readonly string[];
    inspect(snapshot: McpLifecycleSnapshot, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    persist(input: {
        snapshot: McpLifecycleSnapshot;
        action: McpLifecycleAction;
        expectedRevision: number;
        targetRevision: number;
    }): Promise<{
        ok: boolean;
        revision: number;
        reasonCode?: string;
    }>;
    apply(input: {
        snapshot: McpLifecycleSnapshot;
        action: McpLifecycleAction;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    verify(input: {
        snapshot: McpLifecycleSnapshot;
        action: McpLifecycleAction;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    rollback(input: {
        snapshot: McpLifecycleSnapshot;
        baseRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
}
export interface McpLifecycleReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    mcpRef: string;
    status: "enabled" | "disabled" | "deleted";
    deleted: boolean;
    impact: {
        bindingCount: number;
        agentNames: string[];
    };
}
export declare function executeMcpLifecycleCommand(input: {
    envelope: MutationEnvelope;
    mcpRef: string;
    action: McpLifecycleAction;
}, ports: McpLifecycleCommandPorts, signal?: AbortSignal): Promise<McpLifecycleReceipt>;
//# sourceMappingURL=mcp-lifecycle-command.d.ts.map