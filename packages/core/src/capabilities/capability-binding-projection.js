const AGENT_PUBLIC_REF_PATTERN = /^agent_v1_[a-f0-9]{24}$/;
export function buildCapabilityBindingProjection(input) {
    const boundIds = new Set(input.bindings
        .filter((binding) => binding.catalog_id === input.catalogId && binding.status === "enabled")
        .map((binding) => binding.agent_id));
    const owners = new Map();
    const agents = input.agents
        .filter((agent) => agent.status === "enabled")
        .map((agent) => {
        const agentRef = input.publicRefForAgentId(agent.agent_id);
        if (!AGENT_PUBLIC_REF_PATTERN.test(agentRef))
            throw new Error("agent_public_ref_invalid");
        const owner = owners.get(agentRef);
        if (owner && owner !== agent.agent_id)
            throw new Error("agent_public_ref_collision");
        owners.set(agentRef, agent.agent_id);
        return { agentRef, name: agent.agent_name.trim(), bound: boundIds.has(agent.agent_id) };
    })
        .sort((left, right) => left.name.localeCompare(right.name) || left.agentRef.localeCompare(right.agentRef));
    return {
        boundAgents: agents
            .filter((agent) => agent.bound)
            .map(({ agentRef, name }) => ({ agentRef, name })),
        availableAgents: agents
            .filter((agent) => !agent.bound)
            .map(({ agentRef, name }) => ({ agentRef, name })),
    };
}
//# sourceMappingURL=capability-binding-projection.js.map