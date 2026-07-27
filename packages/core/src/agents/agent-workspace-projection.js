function normalizedName(value) {
    return value.trim().toLocaleLowerCase();
}
export function buildAgentWorkspaceProjection(input) {
    const subAgents = input.agents.filter((agent) => agent.agentType === "sub_agent");
    const sourceById = new Map(subAgents.map((agent) => [agent.agentId, agent]));
    const duplicateNames = new Set();
    const nameCounts = new Map();
    for (const agent of subAgents) {
        const name = normalizedName(agent.agentName);
        if (name)
            nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    for (const [name, count] of nameCounts)
        if (count > 1)
            duplicateNames.add(name);
    const projectionDiagnostics = new Set();
    for (const binding of input.bindings) {
        if (!sourceById.has(binding.agentId))
            projectionDiagnostics.add("agent_binding_target_missing");
    }
    for (const relationship of input.relationships) {
        if (!sourceById.has(relationship.childAgentId) ||
            (!sourceById.has(relationship.parentAgentId) &&
                !input.agents.some((agent) => agent.agentType === "knowbee" && agent.agentId === relationship.parentAgentId))) {
            projectionDiagnostics.add("agent_relationship_target_missing");
        }
    }
    const details = subAgents
        .map((agent) => {
        const name = agent.agentName.trim();
        const diagnostics = [];
        if (!name)
            diagnostics.push("agent_name_required");
        else if (duplicateNames.has(normalizedName(name)))
            diagnostics.push("agent_name_duplicate");
        const enabledBindings = input.bindings.filter((binding) => binding.agentId === agent.agentId && binding.status === "enabled");
        const parentRelationship = input.relationships.find((relationship) => relationship.childAgentId === agent.agentId && relationship.status === "active");
        const parent = parentRelationship
            ? input.agents.find((candidate) => candidate.agentId === parentRelationship.parentAgentId)
            : undefined;
        const directChildren = input.relationships
            .filter((relationship) => relationship.parentAgentId === agent.agentId && relationship.status === "active")
            .map((relationship) => sourceById.get(relationship.childAgentId)?.agentName.trim())
            .filter((name) => Boolean(name))
            .sort();
        const bindingNames = (kind) => enabledBindings
            .filter((binding) => binding.kind === kind)
            .map((binding) => binding.displayName?.trim())
            .filter((name) => Boolean(name))
            .sort();
        return Object.freeze({
            agentRef: input.publicRefForAgentId(agent.agentId),
            name: name || "이름 없음",
            role: agent.role.trim(),
            status: agent.status,
            profileVersion: agent.profileVersion,
            updatedAt: agent.updatedAt,
            model: Object.freeze({ ...agent.model }),
            parentName: parent?.agentType === "sub_agent"
                ? parent.agentName.trim() || "이름 없음"
                : input.mainAgentName.trim() || "Knowbee",
            directChildCount: directChildren.length,
            bindingCounts: Object.freeze({
                skills: enabledBindings.filter((binding) => binding.kind === "skill").length,
                mcpServers: enabledBindings.filter((binding) => binding.kind === "mcp_server").length,
                yeonjang: enabledBindings.filter((binding) => binding.kind === "yeonjang").length,
            }),
            diagnosticCodes: Object.freeze(diagnostics),
            bindingNames: Object.freeze({
                skills: Object.freeze(bindingNames("skill")),
                mcpServers: Object.freeze(bindingNames("mcp_server")),
                yeonjang: Object.freeze(bindingNames("yeonjang")),
            }),
            directChildNames: Object.freeze(directChildren),
        });
    })
        .sort((left, right) => left.name.localeCompare(right.name) || left.agentRef.localeCompare(right.agentRef));
    const items = details.map(({ bindingNames: _bindingNames, directChildNames: _children, ...item }) => Object.freeze(item));
    return Object.freeze({
        items: Object.freeze(items),
        details: Object.freeze(details),
        summary: Object.freeze({
            total: items.length,
            enabled: items.filter((item) => item.status === "enabled").length,
            disabled: items.filter((item) => item.status === "disabled").length,
            archived: items.filter((item) => item.status === "archived").length,
            degraded: items.filter((item) => item.status === "degraded").length,
            issueCount: items.filter((item) => item.diagnosticCodes.length > 0).length + projectionDiagnostics.size,
            diagnosticCodes: Object.freeze([...projectionDiagnostics].sort()),
        }),
        observedAt: input.observedAt,
    });
}
//# sourceMappingURL=agent-workspace-projection.js.map