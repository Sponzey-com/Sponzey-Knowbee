function permissionScope(tool) {
    if (tool.requiresApproval)
        return "approval_required";
    if (tool.evidenceSourceKind === "web")
        return "external";
    if (tool.riskLevel === "dangerous")
        return "local_system";
    if (tool.sideEffect)
        return "write";
    return "read";
}
export function projectAgentExecutionToolBindings(input) {
    if (!input.toolsEnabled)
        return [];
    return input.tools
        .filter((tool) => tool.availableSources == null || tool.availableSources.includes(input.source))
        .map((tool) => ({
        tool_id: tool.name,
        label: tool.description.trim() || tool.name,
        permission_scope: permissionScope(tool),
    }))
        .sort((left, right) => left.tool_id.localeCompare(right.tool_id));
}
//# sourceMappingURL=execution-tool-bindings.js.map