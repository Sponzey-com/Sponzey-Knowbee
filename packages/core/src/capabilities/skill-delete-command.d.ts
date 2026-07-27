import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
import type { SkillRuntimeStatus, SkillUpdateSnapshot } from "./skill-update-command.js";
export interface SkillDeleteSnapshot {
    internalSkillId: string;
    skillRef: string;
    displayName: string;
    description: string;
    sourceKind: SkillUpdateSnapshot["sourceKind"];
    runtimeStatus: SkillRuntimeStatus;
    revision: number;
}
export interface SkillDeleteCommandPorts {
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
    resolveSkill(skillRef: string): SkillDeleteSnapshot | null;
    boundAgentNames(internalSkillId: string): readonly string[];
    persistArchive(input: {
        snapshot: SkillDeleteSnapshot;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
    };
    verifyArchived(input: {
        internalSkillId: string;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        snapshot: SkillDeleteSnapshot;
        baseRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
}
export interface SkillDeleteUserReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    skillRef: string;
    deleted: boolean;
    impact: {
        bindingCount: number;
        agentNames: string[];
    };
}
export declare function executeSkillDeleteCommand(input: {
    envelope: MutationEnvelope;
    skillRef: string;
}, ports: SkillDeleteCommandPorts): Promise<SkillDeleteUserReceipt>;
//# sourceMappingURL=skill-delete-command.d.ts.map