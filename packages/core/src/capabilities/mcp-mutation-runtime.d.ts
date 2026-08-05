import type { MutationEnvelope } from "./capability-security-boundary.js";
import type { McpConnectionDraft } from "./mcp-connection-validation.js";
import { type McpLifecycleAction, type McpLifecycleReceipt } from "./mcp-lifecycle-command.js";
import { type McpMutationReceipt, type McpMutationReceiptPorts } from "./mcp-mutation-command.js";
import { type McpRecoveryReceipt } from "./mcp-recovery-command.js";
export interface McpPersistedEntry {
    internalMcpId: string;
    draft: McpConnectionDraft;
    status?: "enabled" | "disabled";
}
export interface McpConfigurationRollbackSnapshot {
    readonly revision: number;
    readonly entries: readonly McpPersistedEntry[];
    readonly token: unknown;
}
export interface McpConfigurationStorePort {
    currentRevision(): number;
    listEntries(): readonly McpPersistedEntry[];
    listKnownIdentities(): readonly {
        internalMcpId: string;
        displayName: string;
    }[];
    runtimeConfigurationSnapshot(): unknown;
    persist(input: {
        mode: "create" | "update";
        internalMcpId: string;
        draft: McpConnectionDraft;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
        rollbackSnapshot?: McpConfigurationRollbackSnapshot;
    };
    persistLifecycle(input: {
        internalMcpId: string;
        action: McpLifecycleAction;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
        rollbackSnapshot?: McpConfigurationRollbackSnapshot;
    };
    persistRecovery(input: {
        internalMcpId: string;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
        rollbackSnapshot?: McpConfigurationRollbackSnapshot;
    };
    rollback(snapshot: McpConfigurationRollbackSnapshot): {
        ok: boolean;
        reasonCode?: string;
    };
}
export interface McpRuntimeRollbackSnapshot {
    readonly token: unknown;
}
export interface McpRuntimeApplyPort {
    capture(): McpRuntimeRollbackSnapshot;
    apply(input: {
        configuration: unknown;
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
    verifyLifecycle(input: {
        internalMcpId: string;
        action: McpLifecycleAction;
        targetRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    captureTarget(internalMcpId: string): McpRuntimeRollbackSnapshot;
    applyTarget(input: {
        internalMcpId: string;
        configuration: unknown;
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
    rollbackTarget(snapshot: McpRuntimeRollbackSnapshot, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    rollback(snapshot: McpRuntimeRollbackSnapshot, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
}
export interface McpConnectionInspectionPort {
    inspect(draft: McpConnectionDraft, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
        draft?: McpConnectionDraft;
    }>;
}
export interface McpMutationRuntime {
    currentRevision(): number;
    executeCreate(input: {
        envelope: MutationEnvelope;
        draft: unknown;
        signal?: AbortSignal;
    }): Promise<McpMutationReceipt>;
    executeUpdate(input: {
        envelope: MutationEnvelope;
        mcpRef: string;
        draft: unknown;
        signal?: AbortSignal;
    }): Promise<McpMutationReceipt>;
    executeProtectedUpdate(input: {
        envelope: MutationEnvelope;
        mcpRef: string;
        change: unknown;
        signal?: AbortSignal;
    }): Promise<McpMutationReceipt>;
    inspectExisting(input: {
        mcpRef: string;
        signal?: AbortSignal;
    }): Promise<McpExistingInspectionReceipt>;
    executeLifecycle(input: {
        envelope: MutationEnvelope;
        mcpRef: string;
        action: McpLifecycleAction;
        signal?: AbortSignal;
    }): Promise<McpLifecycleReceipt>;
    executeRecovery(input: {
        envelope: MutationEnvelope;
        mcpRef: string;
        signal?: AbortSignal;
    }): Promise<McpRecoveryReceipt>;
}
export interface McpExistingInspectionReceipt {
    state: "ready" | "failed" | "cancelled" | "not_found";
    ready: boolean;
    reasonCode: string | null;
    observedAt: number;
}
export declare function createMcpMutationRuntime(input: {
    store: McpConfigurationStorePort;
    runtime: McpRuntimeApplyPort;
    inspection: McpConnectionInspectionPort;
    receipts: McpMutationReceiptPorts;
    createInternalMcpId(): string;
    publicRefForMcpId(internalMcpId: string): string;
    boundAgentNames?(internalMcpId: string): readonly string[];
}): McpMutationRuntime;
//# sourceMappingURL=mcp-mutation-runtime.d.ts.map