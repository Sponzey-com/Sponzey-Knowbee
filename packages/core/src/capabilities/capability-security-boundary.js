export function validateMutationEnvelope(input) {
    const diagnostics = [];
    const requiredText = [input.envelope.actorRef, input.envelope.scope, input.envelope.mutationId, input.envelope.purpose, input.envelope.nonce];
    if (requiredText.some((value) => !value.trim()))
        diagnostics.push({ reasonCode: "mutation_field_missing" });
    if (input.envelope.scope !== input.requiredScope)
        diagnostics.push({ reasonCode: "mutation_scope_denied" });
    if (input.usedNonces.has(input.envelope.nonce))
        diagnostics.push({ reasonCode: "mutation_nonce_replayed" });
    if (input.now - input.envelope.issuedAt > input.maxAgeMs || input.envelope.issuedAt > input.now)
        diagnostics.push({ reasonCode: "mutation_expired" });
    if (input.envelope.targetRevision !== input.currentRevision + 1)
        diagnostics.push({ reasonCode: "mutation_revision_conflict" });
    return { ok: diagnostics.length === 0, diagnostics };
}
const USER_FIELDS = new Set(["name", "kind", "status", "reasonCode", "allowedActions", "revision", "observedAt"]);
const FIELD_DEBUG_FIELDS = new Set([...USER_FIELDS, "internalId", "mutationId", "targetRevision"]);
export function projectCapabilityAudience(input) {
    if (input.audience === "audit") {
        if (!input.authorized)
            throw new Error("Audit authorization required");
        return { ...input.source };
    }
    const allowed = input.audience === "field_debug" ? FIELD_DEBUG_FIELDS : USER_FIELDS;
    return Object.fromEntries(Object.entries(input.source).filter(([key]) => allowed.has(key)));
}
export function createRuntimeConfigSnapshot(externalConstants, allowlist) {
    const snapshot = {};
    for (const key of allowlist)
        if (externalConstants[key] !== undefined)
            snapshot[key] = externalConstants[key];
    return Object.freeze(snapshot);
}
export function rejectRuntimeEnvironmentMutation(key) { throw new Error(`Runtime environment mutation is prohibited: ${key}`); }
//# sourceMappingURL=capability-security-boundary.js.map