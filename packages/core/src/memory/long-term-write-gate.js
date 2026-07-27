export const LONG_TERM_MEMORY_CATEGORIES = [
    "recurring_user_preference",
    "agent_role_knowledge",
    "confirmed_decision",
    "long_horizon_goal",
    "approved_work_context",
];
function normalizeString(value) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}
function normalizeStringArray(values) {
    return [...new Set(values.map((value) => normalizeString(value)).filter((value) => Boolean(value)))];
}
export function longTermMemoryOwnerScopeKey(owner) {
    return `${owner.ownerType}:${owner.ownerId.trim()}`;
}
function isOwnerMissing(owner) {
    return !owner?.ownerType || !normalizeString(owner.ownerId);
}
function isOwnerWritable(owner) {
    return (owner.ownerType === "knowbee" || owner.ownerType === "sub_agent") && !isOwnerMissing(owner);
}
const STORAGE_NEEDS = new Set(["durable_user_fact", "user_preference", "project_fact", "agent_learning", "approved_child_result", "trusted_setting"]);
const SENSITIVITIES = new Set(["not_sensitive", "personal", "internal", "sensitive", "secret"]);
const USER_INTENTS = new Set(["explicit_user_request", "trusted_setting", "parent_review_accepted", "learning_event_approved", "admin_review_approved"]);
const CATEGORIES = new Set(LONG_TERM_MEMORY_CATEGORIES);
export function validateLongTermMemoryWriteGate(input, options = {}) {
    const issueCodes = [];
    const sourceEvidenceRefs = normalizeStringArray(input.sourceEvidenceRefs ?? []);
    const retentionPurpose = normalizeString(input.retentionPurpose);
    if (isOwnerMissing(input.targetOwner))
        issueCodes.push("target_owner_missing");
    else if (!isOwnerWritable(input.targetOwner))
        issueCodes.push("target_owner_not_writable");
    if (options.expectedOwner &&
        (options.expectedOwner.ownerType !== input.targetOwner.ownerType ||
            options.expectedOwner.ownerId.trim() !== input.targetOwner.ownerId.trim())) {
        issueCodes.push("target_owner_mismatch");
    }
    if (!input.category)
        issueCodes.push("category_missing");
    else if (!CATEGORIES.has(input.category))
        issueCodes.push("category_invalid");
    if (!input.storageNeed)
        issueCodes.push("storage_need_missing");
    else if (!STORAGE_NEEDS.has(input.storageNeed))
        issueCodes.push("storage_need_invalid");
    if (!input.sensitivity)
        issueCodes.push("sensitivity_missing");
    else if (!SENSITIVITIES.has(input.sensitivity))
        issueCodes.push("sensitivity_invalid");
    if (input.sensitivity === "secret")
        issueCodes.push("sensitivity_blocked");
    if (!input.userIntent)
        issueCodes.push("user_intent_missing");
    else if (!USER_INTENTS.has(input.userIntent))
        issueCodes.push("user_intent_invalid");
    if (sourceEvidenceRefs.length === 0)
        issueCodes.push("source_evidence_missing");
    if (!retentionPurpose)
        issueCodes.push("retention_purpose_missing");
    return {
        ok: issueCodes.length === 0,
        issueCodes: [...new Set(issueCodes)],
        ...(!isOwnerMissing(input.targetOwner)
            ? { targetOwnerScopeKey: longTermMemoryOwnerScopeKey(input.targetOwner) }
            : {}),
        ...(CATEGORIES.has(input.category) ? { category: input.category } : {}),
        ...(input.storageNeed ? { storageNeed: input.storageNeed } : {}),
        ...(input.sensitivity ? { sensitivity: input.sensitivity } : {}),
        ...(input.userIntent ? { userIntent: input.userIntent } : {}),
        sourceEvidenceRefs,
        ...(retentionPurpose ? { retentionPurpose } : {}),
    };
}
//# sourceMappingURL=long-term-write-gate.js.map