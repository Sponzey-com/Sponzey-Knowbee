export function queryYeonjangCapabilityCatalog(projection, input = {}) {
    const search = input.search?.trim().toLocaleLowerCase() ?? "";
    const filtered = projection.items.filter((item) => {
        if (search && !item.displayName.toLocaleLowerCase().includes(search))
            return false;
        if (input.location && item.location !== input.location)
            return false;
        if (input.platform && item.platform !== input.platform)
            return false;
        if (input.status && item.status !== input.status)
            return false;
        return true;
    });
    let start = 0;
    if (input.cursor) {
        const index = filtered.findIndex((item) => item.yeonjangRef === input.cursor);
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
    const hasMore = start + items.length < filtered.length;
    return {
        items,
        nextCursor: hasMore ? (items.at(-1)?.yeonjangRef ?? null) : null,
        cursorValid: true,
        totalMatches: filtered.length,
        summary: projection.summary,
        observedAt: projection.observedAt,
    };
}
export function resolveYeonjangCapabilityDetail(projection, yeonjangRef) {
    return projection.items.find((item) => item.yeonjangRef === yeonjangRef) ?? null;
}
//# sourceMappingURL=yeonjang-capability-query.js.map