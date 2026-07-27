export function projectAgentWorkspaceQueryLog(input) {
    const base = {
        level: input.level,
        status: input.status,
        resultCount: Math.max(0, Math.floor(input.resultCount)),
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    };
    if (input.level === "product")
        return Object.freeze(base);
    if (input.level === "field_debug")
        return Object.freeze({
            ...base,
            durationMs: Math.max(0, Math.floor(input.durationMs)),
            filterCount: Math.max(0, Math.floor(input.filterCount)),
        });
    return Object.freeze({
        ...base,
        transition: input.status === "passed" ? "query_projected" : "query_rejected",
    });
}
export function queryAgentWorkspace(projection, input = {}) {
    const search = input.search?.trim().toLocaleLowerCase() ?? "";
    const filtered = projection.items.filter((item) => (!search ||
        item.name.toLocaleLowerCase().includes(search) ||
        item.role.toLocaleLowerCase().includes(search)) &&
        (!input.status || item.status === input.status));
    let start = 0;
    if (input.cursor) {
        const index = filtered.findIndex((item) => item.agentRef === input.cursor);
        if (index < 0)
            return {
                items: [],
                nextCursor: null,
                cursorValid: false,
                totalMatches: filtered.length,
                summary: projection.summary,
                observedAt: projection.observedAt,
            };
        start = index + 1;
    }
    const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 50)));
    const items = filtered.slice(start, start + limit);
    return {
        items,
        nextCursor: start + items.length < filtered.length ? (items.at(-1)?.agentRef ?? null) : null,
        cursorValid: true,
        totalMatches: filtered.length,
        summary: projection.summary,
        observedAt: projection.observedAt,
    };
}
export function resolveAgentWorkspaceDetail(projection, agentRef) {
    return projection.details.find((item) => item.agentRef === agentRef) ?? null;
}
//# sourceMappingURL=agent-workspace-query.js.map