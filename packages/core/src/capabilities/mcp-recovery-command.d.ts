import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
export interface McpRecoverySnapshot {
    internalMcpId: string;
    mcpRef: string;
    revision: number;
}
export interface McpRecoveryCommandPorts {
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
    resolveMcp(mcpRef: string): McpRecoverySnapshot | null;
    inspect(snapshot: McpRecoverySnapshot, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    persistRevision(input: {
        internalMcpId: string;
        expectedRevision: number;
        targetRevision: number;
    }): Promise<{
        ok: boolean;
        revision: number;
        reasonCode?: string;
    }>;
    applyTarget(input: {
        internalMcpId: string;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    verifyTarget(input: {
        internalMcpId: string;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
        toolCount: number;
    }>;
    rollbackTarget(input: {
        internalMcpId: string;
        baseRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
}
export interface McpRecoveryReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    mcpRef: string;
    ready: boolean;
    toolCount: number;
}
export declare function executeMcpRecoveryCommand(input: {
    envelope: MutationEnvelope;
    mcpRef: string;
}, ports: McpRecoveryCommandPorts, signal?: AbortSignal): Promise<McpRecoveryReceipt>;
//# sourceMappingURL=mcp-recovery-command.d.ts.map