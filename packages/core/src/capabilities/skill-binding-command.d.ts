import { type CapabilityMutationState } from "./capability-mutation-state-machine.js";
import { type MutationEnvelope } from "./capability-security-boundary.js";
export interface SkillBindingCommandPorts {
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
    resolveSkill(skillRef: string): {
        internalSkillId: string;
        active: boolean;
    } | null;
    resolveAgent(agentRef: string): {
        internalAgentId: string;
        name: string;
    } | null;
    bindingEnabled(input: {
        internalSkillId: string;
        internalAgentId: string;
    }): boolean;
    persist(input: {
        internalSkillId: string;
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
        internalSkillId: string;
        internalAgentId: string;
        enabled: boolean;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        internalSkillId: string;
        internalAgentId: string;
        enabled: boolean;
        baseRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
}
export interface SkillBindingUserReceipt {
    mutationId: string;
    state: CapabilityMutationState | "rejected";
    reasonCode: string | null;
    allowedActions: readonly string[];
    revision: number;
    skillRef: string;
    agentRef: string;
    bound: boolean;
}
export declare function executeSkillBindingCommand(input: {
    envelope: MutationEnvelope;
    skillRef: string;
    agentRef: string;
    action: "bind" | "unbind";
}, ports: SkillBindingCommandPorts): Promise<SkillBindingUserReceipt>;
//# sourceMappingURL=skill-binding-command.d.ts.map