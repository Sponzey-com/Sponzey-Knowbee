import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
import { type SkillSourceInspection, type SkillSourceKind } from "./skill-source-validation.js";
export interface SkillCreateDraft {
    displayName: string;
    description: string;
    sourceKind: SkillSourceKind;
    requestedPath?: string;
}
export interface SkillCreateCommandPorts {
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
    existingNames(): readonly string[];
    inspectSource(input: {
        requestedPath: string;
    }): SkillSourceInspection;
    createInternalSkillId(): string;
    persist(input: {
        internalSkillId: string;
        skillKind: "instruction_skill";
        draft: SkillCreateDraft;
        canonicalPath?: string;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
    };
    apply(input: {
        internalSkillId: string;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    verify(input: {
        internalSkillId: string;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        internalSkillId: string;
        baseRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    publicRefForSkillId(skillId: string): string;
}
export interface SkillCreateUserReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    skillRef: string | null;
}
export declare function executeSkillCreateCommand(input: {
    envelope: MutationEnvelope;
    draft: SkillCreateDraft;
}, ports: SkillCreateCommandPorts): Promise<SkillCreateUserReceipt>;
//# sourceMappingURL=skill-create-command.d.ts.map