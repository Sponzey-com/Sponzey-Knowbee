import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
import type { SkillSourceKind } from "./skill-source-validation.js";
export type SkillRuntimeStatus = "active" | "inactive";
export interface SkillUpdateSnapshot {
    internalSkillId: string;
    skillRef: string;
    displayName: string;
    description: string;
    sourceKind: SkillSourceKind;
    runtimeStatus: SkillRuntimeStatus;
    revision: number;
}
export interface SkillUpdateChange {
    displayName?: string;
    description?: string;
    runtimeStatus?: SkillRuntimeStatus;
}
export interface SkillUpdateCommandPorts {
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
    resolveSkill(skillRef: string): SkillUpdateSnapshot | null;
    existingNames(): readonly {
        internalSkillId: string;
        displayName: string;
    }[];
    persist(input: {
        internalSkillId: string;
        displayName: string;
        description: string;
        runtimeStatus: SkillRuntimeStatus;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
    };
    apply(input: {
        internalSkillId: string;
        runtimeStatus: SkillRuntimeStatus;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    verify(input: {
        internalSkillId: string;
        displayName: string;
        description: string;
        runtimeStatus: SkillRuntimeStatus;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        snapshot: SkillUpdateSnapshot;
        baseRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
}
export interface SkillUpdateUserReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    skillRef: string | null;
}
export declare function executeSkillUpdateCommand(input: {
    envelope: MutationEnvelope;
    skillRef: string;
    change: SkillUpdateChange;
}, ports: SkillUpdateCommandPorts): Promise<SkillUpdateUserReceipt>;
//# sourceMappingURL=skill-update-command.d.ts.map