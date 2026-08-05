const ALLOWED_ROLES = new Set(["audit_reader", "administrator"]);
const ALLOWED_PURPOSES = new Set([
    "incident_review",
    "quality_review",
    "security_review",
]);
function normalized(value) {
    const result = value?.trim();
    return result || undefined;
}
export function decideAuditAccess(input) {
    if (!input.principal?.principalRef.trim()) {
        return { allowed: false, reasonCode: "audit_principal_missing" };
    }
    if (!ALLOWED_ROLES.has(input.principal.role)) {
        return { allowed: false, reasonCode: "audit_role_denied" };
    }
    const mutation = input.operation !== "view" && input.operation !== "export";
    if (mutation && input.principal.role !== "administrator") {
        return { allowed: false, reasonCode: "audit_operation_denied" };
    }
    const purpose = normalized(input.purpose);
    if (!purpose || !ALLOWED_PURPOSES.has(purpose)) {
        return { allowed: false, reasonCode: "audit_purpose_invalid" };
    }
    if (mutation && purpose !== "security_review") {
        return { allowed: false, reasonCode: "audit_purpose_invalid" };
    }
    const runId = normalized(input.runId);
    const requestGroupId = normalized(input.requestGroupId);
    const scopeRef = normalized(input.scopeRef);
    if (!runId && !requestGroupId && !scopeRef) {
        return { allowed: false, reasonCode: "audit_scope_missing" };
    }
    const allowsRun = !runId ||
        input.principal.runIds.includes(runId) ||
        (input.principal.role === "administrator" && input.principal.runIds.includes("*"));
    const allowsRequestGroup = !requestGroupId ||
        input.principal.requestGroupIds.includes(requestGroupId) ||
        (input.principal.role === "administrator" && input.principal.requestGroupIds.includes("*"));
    const allowsScope = !scopeRef ||
        input.principal.scopeRefs?.includes(scopeRef) === true ||
        (input.principal.role === "administrator" && input.principal.scopeRefs?.includes("*") === true);
    if (!allowsRun || !allowsRequestGroup || !allowsScope) {
        return { allowed: false, reasonCode: "audit_scope_denied" };
    }
    return { allowed: true, reasonCode: "audit_access_allowed" };
}
export function createAuditAccessReceipt(input, decision, at) {
    return Object.freeze({
        schemaVersion: "audit-access-v2",
        principalRef: normalized(input.principal?.principalRef) ?? null,
        role: normalized(input.principal?.role) ?? null,
        purpose: normalized(input.purpose) ?? null,
        operation: input.operation,
        runId: normalized(input.runId) ?? null,
        requestGroupId: normalized(input.requestGroupId) ?? null,
        scopeRef: normalized(input.scopeRef) ?? null,
        result: decision.allowed ? "allowed" : "denied",
        reasonCode: decision.reasonCode,
        at,
    });
}
//# sourceMappingURL=audit-access.js.map