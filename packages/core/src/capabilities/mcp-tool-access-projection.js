const AGENT_PUBLIC_REF_PATTERN = /^agent_v1_[a-f0-9]{24}$/u;
function normalizeToken(value) {
    return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/gu, "_");
}
function names(values) {
    return new Set(values.map(normalizeToken).filter(Boolean));
}
export function buildMcpToolAccessProjection(input) {
    const bindings = new Map(input.bindings
        .filter((binding) => binding.catalog_id === input.catalogId && binding.status === "enabled")
        .map((binding) => [binding.agent_id, binding]));
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
        return { agent, agentRef };
    })
        .sort((left, right) => left.agent.agent_name.localeCompare(right.agent.agent_name) || left.agentRef.localeCompare(right.agentRef));
    const toolNames = new Set();
    const tools = input.tools.map((tool) => {
        const toolName = tool.name.trim();
        if (!toolName || toolNames.has(toolName))
            throw new Error("mcp_tool_name_collision");
        toolNames.add(toolName);
        const candidates = names([toolName, tool.registeredName ?? "", `${input.serverName}:${toolName}`, `${input.catalogId}:${toolName}`]);
        const access = agents.map(({ agent, agentRef }) => {
            const binding = bindings.get(agent.agent_id);
            let status = "not_bound";
            if (binding) {
                const disabled = names(binding.disabled_tool_names);
                const enabled = names(binding.enabled_tool_names);
                status = [...candidates].some((candidate) => disabled.has(candidate))
                    ? "disabled"
                    : enabled.size === 0 || [...candidates].some((candidate) => enabled.has(candidate))
                        ? "allowed"
                        : "disabled";
            }
            return { agentRef, agentName: agent.agent_name.trim(), status };
        });
        return { name: toolName, description: tool.description.trim(), access };
    }).sort((left, right) => left.name.localeCompare(right.name));
    return { tools };
}
//# sourceMappingURL=mcp-tool-access-projection.js.map