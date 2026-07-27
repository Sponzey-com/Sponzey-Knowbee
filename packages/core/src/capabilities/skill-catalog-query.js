const SKILL_PUBLIC_REF_PATTERN = /^skill_v1_[a-f0-9]{24}$/;
function parseMetadata(value) {
    if (!value)
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
function cursorOffset(cursor) {
    if (!cursor)
        return 0;
    const match = /^v1:(\d+)$/.exec(cursor);
    if (!match)
        throw new Error("skill_catalog_cursor_invalid");
    return Number(match[1]);
}
export function buildSkillCatalogPage(input) {
    const limit = input.query.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("skill_catalog_limit_invalid");
    }
    const offset = cursorOffset(input.query.cursor);
    const bindingCounts = new Map();
    const bindingRevisions = new Map();
    for (const binding of input.bindings) {
        bindingRevisions.set(binding.catalog_id, Math.max(bindingRevisions.get(binding.catalog_id) ?? 0, binding.updated_at ?? 0));
        if (binding.status !== "enabled")
            continue;
        bindingCounts.set(binding.catalog_id, (bindingCounts.get(binding.catalog_id) ?? 0) + 1);
    }
    const search = input.query.search?.trim().toLocaleLowerCase() ?? "";
    const publicRefOwners = new Map();
    const projected = [...input.rows]
        .filter((row) => row.status !== "archived")
        .sort((left, right) => left.display_name.localeCompare(right.display_name) || left.skill_id.localeCompare(right.skill_id))
        .map((row) => {
        const metadata = parseMetadata(row.metadata_json);
        const skillRef = input.publicRefForSkillId(row.skill_id);
        if (!SKILL_PUBLIC_REF_PATTERN.test(skillRef))
            throw new Error("skill_public_ref_invalid");
        const owner = publicRefOwners.get(skillRef);
        if (owner && owner !== row.skill_id)
            throw new Error("skill_public_ref_collision");
        publicRefOwners.set(skillRef, row.skill_id);
        const sourceKind = metadata.builtin === true || metadata.sourceKind === "builtin"
            ? "builtin"
            : "local";
        return {
            skillRef,
            displayName: row.display_name,
            description: typeof metadata.description === "string" ? metadata.description : "",
            sourceKind,
            ...(row.risk ? { risk: row.risk } : {}),
            validationStatus: "valid",
            runtimeStatus: row.status === "enabled" ? "active" : "inactive",
            bindingCount: bindingCounts.get(row.skill_id) ?? 0,
            revision: Math.max(row.updated_at, bindingRevisions.get(row.skill_id) ?? 0),
        };
    })
        .filter((item) => !search || `${item.displayName} ${item.description}`.toLocaleLowerCase().includes(search))
        .filter((item) => !input.query.sourceKind || item.sourceKind === input.query.sourceKind)
        .filter((item) => !input.query.runtimeStatus || item.runtimeStatus === input.query.runtimeStatus)
        .filter((item) => !input.query.boundOnly || item.bindingCount > 0);
    const items = projected.slice(offset, offset + limit);
    const end = offset + items.length;
    return {
        items,
        nextCursor: end < projected.length ? `v1:${end}` : null,
        revision: projected.reduce((latest, item) => Math.max(latest, item.revision), 0),
        observedAt: input.observedAt,
    };
}
//# sourceMappingURL=skill-catalog-query.js.map