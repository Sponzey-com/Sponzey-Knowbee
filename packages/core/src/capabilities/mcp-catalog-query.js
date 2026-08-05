const MCP_PUBLIC_REF_PATTERN = /^mcp_v1_[a-f0-9]{24}$/;
function canonicalKey(value) {
    const trimmed = value.trim();
    if (!trimmed)
        throw new Error("mcp_catalog_key_invalid");
    return trimmed.startsWith("mcp:") ? trimmed.slice(4) : trimmed;
}
function metadata(value) {
    if (!value)
        return {};
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error("invalid");
        return parsed;
    }
    catch {
        throw new Error("mcp_catalog_metadata_invalid");
    }
}
function transport(value, fallback) {
    if (value === "stdio" || value === "http")
        return value;
    return fallback ?? "stdio";
}
function offset(cursor) {
    if (!cursor)
        return 0;
    const match = /^v1:(\d+)$/.exec(cursor);
    if (!match)
        throw new Error("mcp_catalog_cursor_invalid");
    return Number(match[1]);
}
function toolsFor(runtime) {
    if (!runtime)
        return [];
    const names = new Set();
    return runtime.tools.map((tool) => {
        const name = tool.name.trim();
        if (!name || names.has(name))
            throw new Error("mcp_tool_name_collision");
        names.add(name);
        return { name, description: tool.description.trim() };
    }).sort((left, right) => left.name.localeCompare(right.name));
}
export function buildMcpCatalogSnapshot(input) {
    const catalogByKey = new Map();
    for (const row of input.rows) {
        if (row.status === "archived")
            continue;
        const key = canonicalKey(row.mcp_server_id);
        if (catalogByKey.has(key))
            throw new Error("mcp_catalog_key_collision");
        catalogByKey.set(key, row);
    }
    const runtimeByKey = new Map();
    for (const runtime of input.runtimeStatuses) {
        const key = canonicalKey(runtime.name);
        if (runtimeByKey.has(key))
            throw new Error("mcp_runtime_key_collision");
        runtimeByKey.set(key, runtime);
    }
    const bindingCounts = new Map();
    const bindingRevisions = new Map();
    for (const binding of input.bindings) {
        bindingRevisions.set(binding.catalog_id, Math.max(bindingRevisions.get(binding.catalog_id) ?? 0, binding.updated_at ?? 0));
        if (binding.status === "enabled")
            bindingCounts.set(binding.catalog_id, (bindingCounts.get(binding.catalog_id) ?? 0) + 1);
    }
    const refs = new Map();
    const displayNames = new Set();
    const keys = [...new Set([...catalogByKey.keys(), ...runtimeByKey.keys()])];
    const items = keys.map((key) => {
        const row = catalogByKey.get(key);
        const runtime = runtimeByKey.get(key);
        const parsed = row ? metadata(row.metadata_json) : {};
        const identity = row?.mcp_server_id ?? `mcp:${runtime.name.trim()}`;
        const mcpRef = input.publicRefForMcpId(identity);
        if (!MCP_PUBLIC_REF_PATTERN.test(mcpRef))
            throw new Error("mcp_public_ref_invalid");
        const owner = refs.get(mcpRef);
        if (owner && owner !== identity)
            throw new Error("mcp_public_ref_collision");
        refs.set(mcpRef, identity);
        const configuredStatus = row ? row.status === "disabled" ? "disabled" : "enabled" : runtime?.enabled === false ? "disabled" : "enabled";
        const required = runtime?.required ?? parsed.required === true;
        const runtimeStatus = configuredStatus === "disabled" || runtime?.enabled === false ? "inactive" : !runtime ? "not_loaded" : runtime.ready ? "ready" : "unavailable";
        const issueCode = runtimeStatus === "inactive" ? "mcp_inactive" : runtimeStatus === "not_loaded" ? "mcp_runtime_not_loaded" : runtimeStatus === "unavailable" ? required ? "mcp_required_unavailable" : "mcp_runtime_unavailable" : null;
        const bindingIds = row ? [row.mcp_server_id] : [runtime.name, `mcp:${runtime.name}`];
        const bindingCount = bindingIds.reduce((total, id) => total + (bindingCounts.get(id) ?? 0), 0);
        const bindingRevision = bindingIds.reduce((latest, id) => Math.max(latest, bindingRevisions.get(id) ?? 0), 0);
        const projectedTools = toolsFor(runtime);
        const displayName = row?.display_name.trim() || runtime.name.trim();
        const normalizedDisplayName = displayName.toLocaleLowerCase();
        if (!displayName || displayNames.has(normalizedDisplayName))
            throw new Error("mcp_display_name_collision");
        displayNames.add(normalizedDisplayName);
        return {
            mcpRef,
            displayName,
            transport: transport(parsed.transport, runtime?.transport),
            configuredStatus,
            runtimeStatus,
            required,
            toolCount: runtimeStatus === "ready" ? projectedTools.length : 0,
            bindingCount,
            issueCode,
            revision: Math.max(row?.updated_at ?? 0, bindingRevision),
            tools: projectedTools,
        };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName) || left.mcpRef.localeCompare(right.mcpRef));
    return { items, revision: items.reduce((latest, item) => Math.max(latest, item.revision), 0), observedAt: input.observedAt };
}
export function buildMcpCatalogPage(input) {
    const limit = input.query.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error("mcp_catalog_limit_invalid");
    const start = offset(input.query.cursor);
    const search = input.query.search?.trim().toLocaleLowerCase() ?? "";
    const snapshot = buildMcpCatalogSnapshot(input);
    const filtered = snapshot.items
        .filter((item) => !search || item.displayName.toLocaleLowerCase().includes(search))
        .filter((item) => !input.query.transport || item.transport === input.query.transport)
        .filter((item) => !input.query.runtimeStatus || item.runtimeStatus === input.query.runtimeStatus)
        .filter((item) => !input.query.boundOnly || item.bindingCount > 0);
    const items = filtered.slice(start, start + limit).map(({ tools: _tools, ...item }) => item);
    const end = start + items.length;
    return { items, nextCursor: end < filtered.length ? `v1:${end}` : null, revision: snapshot.revision, observedAt: snapshot.observedAt };
}
//# sourceMappingURL=mcp-catalog-query.js.map