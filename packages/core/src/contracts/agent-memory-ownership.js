export const AGENT_MEMORY_STORE_KINDS = ["short_term", "long_term", "history"];
export const SHORT_TERM_MEMORY_CATEGORIES = [
    "current_conversation",
    "current_work",
    "recent_tool_result",
    "active_delegation",
    "provisional_judgment",
];
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
export function evaluateAgentMemoryOwnership(input) {
    const issues = [];
    const add = (code, subjectId, storeKind) => {
        issues.push({ code, subjectId, ...(storeKind ? { storeKind } : {}) });
    };
    const agentCounts = new Map();
    const activeAgentIds = new Set();
    for (const agent of input.agents) {
        const agentId = required(agent.agentId, "Agent ID");
        agentCounts.set(agentId, (agentCounts.get(agentId) ?? 0) + 1);
        if (agent.lifecycle === "active")
            activeAgentIds.add(agentId);
    }
    for (const [agentId, count] of agentCounts)
        if (count > 1)
            add("agent_owner_duplicate", agentId);
    const bindingCounts = new Map();
    const namespaceOwners = new Map();
    for (const binding of input.bindings) {
        const agentId = required(binding.agentId, "Memory binding agent ID");
        const namespaceId = required(binding.namespaceId, "Memory namespace ID");
        if (!agentCounts.has(agentId))
            add("memory_binding_owner_unknown", namespaceId, binding.storeKind);
        if (binding.lifecycle === "active") {
            const key = `${agentId}\u0000${binding.storeKind}`;
            bindingCounts.set(key, (bindingCounts.get(key) ?? 0) + 1);
            const existingOwner = namespaceOwners.get(namespaceId);
            if (existingOwner && existingOwner !== agentId)
                add("memory_namespace_shared", namespaceId, binding.storeKind);
            else
                namespaceOwners.set(namespaceId, agentId);
        }
    }
    for (const agentId of activeAgentIds) {
        for (const storeKind of AGENT_MEMORY_STORE_KINDS) {
            const count = bindingCounts.get(`${agentId}\u0000${storeKind}`) ?? 0;
            if (count === 0)
                add("memory_store_binding_missing", agentId, storeKind);
            if (count > 1)
                add("memory_store_binding_duplicate", agentId, storeKind);
        }
    }
    const allowedCategories = new Set(SHORT_TERM_MEMORY_CATEGORIES);
    const allowedScopes = {
        current_conversation: new Set(["session"]),
        current_work: new Set(["run", "work"]),
        recent_tool_result: new Set(["run", "work"]),
        active_delegation: new Set(["delegation"]),
        provisional_judgment: new Set(["run", "work"]),
    };
    for (const entry of input.shortTermEntries) {
        const entryId = required(entry.entryId, "Short-term entry ID");
        const ownerAgentId = required(entry.ownerAgentId, "Short-term owner agent ID");
        const sourceOwnerAgentId = required(entry.sourceOwnerAgentId, "Short-term source owner agent ID");
        required(entry.scopeId, "Short-term scope ID");
        if (!activeAgentIds.has(ownerAgentId))
            add("short_term_owner_unknown", entryId);
        if (sourceOwnerAgentId !== ownerAgentId)
            add("short_term_source_owner_mismatch", entryId);
        if (!allowedCategories.has(entry.category))
            add("short_term_category_invalid", entryId);
        else if (!allowedScopes[entry.category].has(entry.scopeType))
            add("short_term_scope_invalid", entryId);
        if (entry.scopeLifecycle !== "active")
            add("short_term_scope_terminated", entryId);
    }
    const unique = [...new Map(issues.map((issue) => [`${issue.code}\u0000${issue.subjectId}\u0000${issue.storeKind ?? ""}`, issue])).values()];
    return unique.length > 0
        ? { status: "blocked", issues: unique }
        : { status: "eligible", activeAgentIds: [...activeAgentIds].sort() };
}
export async function writeAgentMemoryEntry(input) {
    if (input.decision.status === "blocked")
        return input.decision;
    return { status: "written", result: await input.write(input.decision) };
}
//# sourceMappingURL=agent-memory-ownership.js.map