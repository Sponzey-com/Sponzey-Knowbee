const REF_PATTERNS = {
    skill: /^skill_v1_[a-f0-9]{24}$/u,
    mcp_server: /^mcp_v1_[a-f0-9]{24}$/u,
    yeonjang: /^yeonjang_v1_[a-f0-9]{24}$/u,
};
export function buildAgentCapabilityBindingProjection(input) {
    const catalogKeys = new Set();
    const publicRefOwners = new Map();
    const bindingByKey = new Map();
    const revisions = {
        skill: 0,
        mcp_server: 0,
        yeonjang: 0,
    };
    for (const binding of input.bindings) {
        if (binding.agentId !== input.agentId)
            continue;
        const key = `${binding.kind}:${binding.catalogId}`;
        const existing = bindingByKey.get(key);
        if (existing && existing.revision === binding.revision)
            throw new Error("agent_capability_binding_duplicate");
        if (!existing || existing.revision < binding.revision)
            bindingByKey.set(key, binding);
        revisions[binding.kind] = Math.max(revisions[binding.kind], binding.revision);
    }
    const items = input.catalog.map((source) => {
        const key = `${source.kind}:${source.internalId}`;
        if (catalogKeys.has(key))
            throw new Error("agent_capability_catalog_duplicate");
        catalogKeys.add(key);
        const capabilityRef = input.publicRefForCapability(source.kind, source.internalId);
        if (!REF_PATTERNS[source.kind].test(capabilityRef))
            throw new Error("agent_capability_public_ref_invalid");
        const owner = publicRefOwners.get(capabilityRef);
        if (owner && owner !== key)
            throw new Error("agent_capability_public_ref_collision");
        publicRefOwners.set(capabilityRef, key);
        const binding = bindingByKey.get(key);
        revisions[source.kind] = Math.max(revisions[source.kind], source.revision, binding?.revision ?? 0);
        const reasonCodes = [];
        if (source.catalogStatus === "archived")
            reasonCodes.push("capability_catalog_archived");
        else if (source.catalogStatus !== "enabled")
            reasonCodes.push("capability_catalog_inactive");
        if (source.runtimeStatus === "unavailable")
            reasonCodes.push("capability_runtime_unavailable");
        return Object.freeze({
            capabilityRef,
            kind: source.kind,
            displayName: source.displayName.trim(),
            catalogStatus: source.catalogStatus,
            runtimeStatus: source.runtimeStatus,
            bound: binding?.status === "enabled",
            editable: source.catalogStatus !== "archived",
            revision: Math.max(source.revision, binding?.revision ?? 0),
            reasonCodes: Object.freeze(reasonCodes),
        });
    });
    const orphanReasonCodes = [];
    if ([...bindingByKey.keys()].some((key) => !catalogKeys.has(key)))
        orphanReasonCodes.push("capability_binding_orphaned");
    return Object.freeze({
        agentRef: input.agentRef,
        items: Object.freeze(items.sort((left, right) => left.kind.localeCompare(right.kind) ||
            left.displayName.localeCompare(right.displayName) ||
            left.capabilityRef.localeCompare(right.capabilityRef))),
        orphanReasonCodes: Object.freeze(orphanReasonCodes),
        revisions: Object.freeze(revisions),
        observedAt: input.observedAt,
    });
}
export function queryAgentCapabilityBindings(projection, input = {}) {
    const search = input.search?.trim().toLocaleLowerCase() ?? "";
    const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 100)));
    return Object.freeze({
        ...projection,
        items: projection.items
            .filter((item) => (!search || item.displayName.toLocaleLowerCase().includes(search)) &&
            (!input.kind || item.kind === input.kind))
            .slice(0, limit),
    });
}
//# sourceMappingURL=agent-capability-binding-projection.js.map