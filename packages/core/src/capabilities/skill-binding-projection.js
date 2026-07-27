import { buildCapabilityBindingProjection, } from "./capability-binding-projection.js";
export function buildSkillBindingProjection(input) {
    return buildCapabilityBindingProjection({
        catalogId: input.skillId,
        agents: input.agents,
        bindings: input.bindings,
        publicRefForAgentId: input.publicRefForAgentId,
    });
}
//# sourceMappingURL=skill-binding-projection.js.map