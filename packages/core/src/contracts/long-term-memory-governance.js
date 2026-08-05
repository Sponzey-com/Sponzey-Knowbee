export const COMPACTION_PRESERVATION_CATEGORIES = [
    "goals",
    "constraints",
    "decisions",
    "unresolved_questions",
    "evidence",
    "user_preferences",
    "active_work_state",
];
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function normalizedSet(values, field) {
    return new Set(values.map((value) => required(value, field)));
}
export function evaluateLongTermMemoryMutation(input) {
    const mutationId = required(input.mutationId, "Mutation ID");
    const requesterAgentId = required(input.requesterAgentId, "Requester agent ID");
    const targetAgentId = required(input.targetAgentId, "Target agent ID");
    const expectedTargetAgentId = required(input.expectedTargetAgentId, "Expected target agent ID");
    const targetNamespaceId = required(input.targetNamespaceId, "Target namespace ID");
    const issues = new Set();
    if (targetAgentId !== expectedTargetAgentId)
        issues.add("mutation_owner_mismatch");
    if (!targetNamespaceId.startsWith(`${targetAgentId}:`))
        issues.add("mutation_namespace_owner_mismatch");
    if (!input.storageNeedReviewed)
        issues.add("mutation_storage_need_unreviewed");
    if (input.sensitivity === "secret")
        issues.add("mutation_secret_blocked");
    if (normalizedSet(input.evidenceRefs, "Mutation evidence ref").size === 0)
        issues.add("mutation_evidence_missing");
    if (!input.reviewerRef.trim())
        issues.add("mutation_reviewer_missing");
    if (requesterAgentId !== targetAgentId && !input.crossAgentAuthorizationRef?.trim())
        issues.add("mutation_cross_agent_unauthorized");
    return issues.size > 0
        ? { status: "blocked", issueCodes: [...issues] }
        : { status: "eligible", mutationId, action: input.action, targetAgentId, targetNamespaceId };
}
export function evaluateCompactionPreservation(entries) {
    const byCategory = new Map();
    for (const entry of entries) {
        if (byCategory.has(entry.category))
            throw new Error(`Compaction preservation category ${entry.category} must be unique.`);
        byCategory.set(entry.category, entry);
    }
    const missingCategories = COMPACTION_PRESERVATION_CATEGORIES.filter((category) => !byCategory.has(category));
    const unpreservedCategories = COMPACTION_PRESERVATION_CATEGORIES.filter((category) => {
        const entry = byCategory.get(category);
        if (!entry)
            return false;
        const source = normalizedSet(entry.sourceRefs, `${category} source ref`);
        const output = normalizedSet(entry.outputRefs, `${category} output ref`);
        if (source.size === 0)
            return !entry.explicitEmpty || output.size > 0;
        return entry.explicitEmpty || [...source].some((ref) => !output.has(ref));
    });
    return missingCategories.length > 0 || unpreservedCategories.length > 0
        ? { status: "blocked", missingCategories, unpreservedCategories }
        : { status: "eligible", preservedCategories: [...COMPACTION_PRESERVATION_CATEGORIES] };
}
export async function executeEligibleMemoryGovernance(input) {
    if (!input.eligible)
        return { status: "blocked" };
    return { status: "executed", result: await input.execute() };
}
//# sourceMappingURL=long-term-memory-governance.js.map