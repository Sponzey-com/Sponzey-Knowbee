import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
import { type McpConnectionDraft } from "./mcp-connection-validation.js";
export interface McpMutationReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    mcpRef: string | null;
}
export interface McpMutationReceiptPorts {
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
}
export interface McpCreateCommandPorts extends McpMutationReceiptPorts {
    existingNames(): readonly string[];
    existingPublicRefs(): readonly string[];
    createInternalMcpId(): string;
    publicRefForMcpId(internalMcpId: string): string;
    inspectConnection(draft: McpConnectionDraft, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
        draft?: McpConnectionDraft;
    }>;
    persist(input: {
        internalMcpId: string;
        draft: McpConnectionDraft;
        expectedRevision: number;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok?: boolean;
        revision: number;
        reasonCode?: string;
    }>;
    apply(input: {
        internalMcpId: string;
        draft: McpConnectionDraft;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    verify(input: {
        internalMcpId: string;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    rollback(input: {
        internalMcpId: string;
        baseRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
}
export interface McpUpdateSnapshot {
    internalMcpId: string;
    mcpRef: string;
    draft: McpConnectionDraft;
    revision: number;
}
export interface McpUpdateCommandPorts extends McpMutationReceiptPorts {
    resolveMcp(mcpRef: string): McpUpdateSnapshot | null;
    existingNames(): readonly {
        internalMcpId: string;
        displayName: string;
    }[];
    inspectConnection(draft: McpConnectionDraft, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
        draft?: McpConnectionDraft;
    }>;
    persist(input: {
        snapshot: McpUpdateSnapshot;
        draft: McpConnectionDraft;
        expectedRevision: number;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok?: boolean;
        revision: number;
        reasonCode?: string;
    }>;
    apply(input: {
        internalMcpId: string;
        draft: McpConnectionDraft;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    verify(input: {
        internalMcpId: string;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    rollback(input: {
        snapshot: McpUpdateSnapshot;
        baseRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
}
export declare function executeMcpCreateCommand(input: {
    envelope: MutationEnvelope;
    draft: unknown;
}, ports: McpCreateCommandPorts, signal?: AbortSignal): Promise<McpMutationReceipt>;
export declare function executeMcpUpdateCommand(input: {
    envelope: MutationEnvelope;
    mcpRef: string;
    draft: unknown;
}, ports: McpUpdateCommandPorts, signal?: AbortSignal): Promise<McpMutationReceipt>;
//# sourceMappingURL=mcp-mutation-command.d.ts.map