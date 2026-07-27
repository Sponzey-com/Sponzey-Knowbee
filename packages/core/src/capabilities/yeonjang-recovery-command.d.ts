import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
import type { YeonjangCapabilityItem, YeonjangCapabilityStatus } from "./yeonjang-capability-projection.js";
export type YeonjangRecoveryAction = "reconnect" | "check_permissions";
export interface YeonjangRecoverySnapshot {
    internalInstanceId: string;
    status: YeonjangCapabilityStatus;
    permissionState: YeonjangCapabilityItem["permissionState"];
    runnable: boolean;
}
export interface YeonjangRecoveryCommandPorts {
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
    resolveYeonjang(yeonjangRef: string): YeonjangRecoverySnapshot | null;
    persistIntent(input: {
        internalInstanceId: string;
        action: YeonjangRecoveryAction;
        expectedRevision: number;
        targetRevision: number;
    }): Promise<{
        ok: boolean;
        revision: number;
        reasonCode?: string;
    }>;
    applyAction(input: {
        internalInstanceId: string;
        action: YeonjangRecoveryAction;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    inspectResult(internalInstanceId: string, signal: AbortSignal): Promise<YeonjangRecoverySnapshot | null>;
    rollbackIntent(input: {
        internalInstanceId: string;
        baseRevision: number;
    }, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
}
export interface YeonjangRecoveryReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    yeonjangRef: string;
    action: YeonjangRecoveryAction;
    ready: boolean;
}
export interface YeonjangRecoveryVerificationPolicy {
    maxAttempts: number;
    intervalMs: number;
    wait(intervalMs: number, signal: AbortSignal): Promise<void>;
}
export declare function executeYeonjangRecoveryCommand(input: {
    envelope: MutationEnvelope;
    yeonjangRef: string;
    action: YeonjangRecoveryAction;
}, ports: YeonjangRecoveryCommandPorts, signal?: AbortSignal, verificationPolicy?: YeonjangRecoveryVerificationPolicy): Promise<YeonjangRecoveryReceipt>;
//# sourceMappingURL=yeonjang-recovery-command.d.ts.map