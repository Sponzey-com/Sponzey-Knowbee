const METHOD_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/u;
function hasOwn(record, key) {
    return Object.prototype.hasOwnProperty.call(record, key);
}
function parseStringArray(payload, key) {
    if (!hasOwn(payload, key))
        return [];
    const value = payload[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
        return null;
    return value.map((item) => item.trim()).filter(Boolean);
}
export function extractIntakeMethodConstraints(actions) {
    const requestedMethods = new Set();
    const exclusiveMethods = new Set();
    const targetIds = new Set();
    for (const action of actions) {
        const preferred = parseStringArray(action.payload, "preferred_methods");
        const exclusive = parseStringArray(action.payload, "exclusive_methods");
        if (!preferred || !exclusive)
            return { ok: false, reasonCode: "method_constraints_malformed" };
        if ([...preferred, ...exclusive].some((method) => !METHOD_IDENTIFIER_PATTERN.test(method))) {
            return { ok: false, reasonCode: "method_identifier_invalid" };
        }
        for (const method of preferred)
            requestedMethods.add(method);
        for (const method of exclusive)
            exclusiveMethods.add(method);
        if (hasOwn(action.payload, "target_instance")) {
            const target = action.payload.target_instance;
            if (target === null)
                continue;
            if (typeof target !== "string")
                return { ok: false, reasonCode: "method_constraints_malformed" };
            if (target.trim())
                targetIds.add(target.trim());
        }
    }
    if (targetIds.size > 1)
        return { ok: false, reasonCode: "target_instance_conflict" };
    const targetId = [...targetIds][0];
    return {
        ok: true,
        constraints: {
            requestedMethods: [...requestedMethods],
            exclusiveMethods: [...exclusiveMethods],
            ...(targetId ? { targetId } : {}),
        },
    };
}
//# sourceMappingURL=intake-method-constraints.js.map