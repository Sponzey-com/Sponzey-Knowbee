import { type CapabilityBindingAgentRow, type CapabilityBindingProjectionRow } from "./capability-binding-projection.js";
export type SkillBindingAgentRow = CapabilityBindingAgentRow;
export type SkillBindingProjectionRow = CapabilityBindingProjectionRow;
export declare function buildSkillBindingProjection(input: {
    skillId: string;
    agents: readonly SkillBindingAgentRow[];
    bindings: readonly SkillBindingProjectionRow[];
    publicRefForAgentId: (agentId: string) => string;
}): {
    boundAgents: {
        agentRef: string;
        name: string;
    }[];
    availableAgents: {
        agentRef: string;
        name: string;
    }[];
};
//# sourceMappingURL=skill-binding-projection.d.ts.map