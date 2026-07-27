function validCapturedAt(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("live_acceptance_snapshot_captured_at_invalid");
    }
}
function isExtensionBinding(binding) {
    return binding.capability_kind === "skill" || binding.capability_kind === "mcp_server";
}
export function captureLiveAcceptanceRuntimeSnapshot(input) {
    validCapturedAt(input.capturedAt);
    const bindings = input.readers.listBindings();
    const skillCatalogs = input.readers.listSkillCatalogs();
    const mcpCatalogs = input.readers.listMcpCatalogs();
    const tools = input.readers.listTools();
    const yeonjangInstances = input.readers.listYeonjangInstances(input.capturedAt);
    return Object.freeze({
        capturedAt: input.capturedAt,
        extensions: Object.freeze(bindings
            .filter(isExtensionBinding)
            .map((binding) => Object.freeze({
            bindingId: binding.binding_id,
            agentId: binding.agent_id,
            capabilityKind: binding.capability_kind,
            catalogId: binding.catalog_id,
            bindingStatus: binding.status,
            secretScopeId: binding.secret_scope_id,
            enabledToolNamesJson: binding.enabled_tool_names_json,
            disabledToolNamesJson: binding.disabled_tool_names_json,
        }))),
        catalogs: Object.freeze([
            ...skillCatalogs.map((catalog) => Object.freeze({
                capability: "skill",
                catalogId: catalog.skill_id,
                status: catalog.status,
                risk: catalog.risk,
                toolNamesJson: catalog.tool_names_json,
            })),
            ...mcpCatalogs.map((catalog) => Object.freeze({
                capability: "mcp",
                catalogId: catalog.mcp_server_id,
                status: catalog.status,
                risk: catalog.risk,
                toolNamesJson: catalog.tool_names_json,
            })),
        ]),
        tools: Object.freeze(tools.map((tool) => Object.freeze({
            name: tool.name,
            riskLevel: tool.riskLevel,
            requiresApproval: tool.requiresApproval,
            hasSideEffect: tool.sideEffect !== undefined,
        }))),
        yeonjangInstances: Object.freeze(yeonjangInstances.map((instance) => Object.freeze({
            instanceId: instance.instanceId,
            displayName: instance.displayName,
            state: instance.state,
            trustState: instance.trustState,
            scopeAccess: instance.scopeAccess,
            runnableTarget: instance.runnableTarget,
            liveSessionCount: instance.liveSessionCount,
            duplicateLiveSessionDetected: instance.duplicateLiveSessionDetected,
            session: instance.session
                ? Object.freeze({
                    sessionId: instance.session.sessionId,
                    state: instance.session.state,
                    lastSeenAt: instance.session.lastSeenAt,
                    endedAt: instance.session.endedAt,
                    stale: instance.session.stale,
                })
                : null,
        }))),
    });
}
//# sourceMappingURL=live-acceptance-runtime-snapshot-adapter.js.map