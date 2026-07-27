const AGENT_REF_PATTERN = /^agent_v1_[a-f0-9]{24}$/u;
const STATUSES = new Set([
    "enabled",
    "disabled",
    "archived",
    "degraded",
]);
const RISKS = new Set([
    "safe",
    "moderate",
    "external",
    "sensitive",
    "dangerous",
]);
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function nonEmptyText(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
function optionalNonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
function projectModel(value, diagnosticCodes) {
    if (value === undefined || value === null) {
        diagnosticCodes.push("agent_model_unconfigured");
        return { configured: false, availability: "unavailable" };
    }
    const input = record(value);
    const providerName = nonEmptyText(input?.providerId);
    const modelName = nonEmptyText(input?.modelId);
    const effort = input?.effort === undefined ? undefined : nonEmptyText(input.effort);
    const fallbackModelName = input?.fallbackModelId === undefined ? undefined : nonEmptyText(input.fallbackModelId);
    if (!input || !providerName || !modelName || effort === null || fallbackModelName === null) {
        diagnosticCodes.push("agent_model_profile_invalid");
        return { configured: false, availability: "unavailable" };
    }
    return {
        configured: true,
        availability: "configured",
        providerName,
        modelName,
        ...(effort ? { effort } : {}),
        ...(fallbackModelName ? { fallbackModelName } : {}),
    };
}
function invalidMemory() {
    return {
        retentionPolicy: "session",
        capsuleMode: "session_compaction",
        rawWindowSize: null,
        compactThreshold: null,
        writebackReviewRequired: false,
        lastCompactedAt: null,
        capsuleCount: 0,
    };
}
function projectMemory(value, diagnosticCodes) {
    const input = record(value);
    const retentionPolicy = input?.retentionPolicy;
    const capsuleMode = input?.capsuleMode ?? "session_compaction";
    const rawWindowSize = optionalNonNegativeInteger(input?.rawWindowSize);
    const compactThreshold = optionalNonNegativeInteger(input?.compactThreshold);
    const lastCompactedAt = input?.lastCompactedAt === undefined ? null : optionalNonNegativeInteger(input.lastCompactedAt);
    const capsuleCount = optionalNonNegativeInteger(input?.capsuleCount ?? 0);
    const valid = input !== null &&
        (retentionPolicy === "session" ||
            retentionPolicy === "short_term" ||
            retentionPolicy === "long_term") &&
        (capsuleMode === "session_compaction" || capsuleMode === "rolling_summary") &&
        typeof input.writebackReviewRequired === "boolean" &&
        (input.rawWindowSize === undefined || rawWindowSize !== null) &&
        (input.compactThreshold === undefined || compactThreshold !== null) &&
        (input.lastCompactedAt === undefined || lastCompactedAt !== null) &&
        capsuleCount !== null;
    if (!valid) {
        diagnosticCodes.push("agent_memory_policy_invalid");
        return invalidMemory();
    }
    return {
        retentionPolicy: retentionPolicy,
        capsuleMode: capsuleMode,
        rawWindowSize,
        compactThreshold,
        writebackReviewRequired: input.writebackReviewRequired,
        lastCompactedAt,
        capsuleCount,
    };
}
function invalidPermission() {
    return {
        riskCeiling: "safe",
        approvalRequiredFrom: "safe",
        allowExternalNetwork: false,
        allowFilesystemWrite: false,
        allowShellExecution: false,
        allowScreenControl: false,
        allowedPathCount: 0,
    };
}
function projectPermission(value, diagnosticCodes) {
    const input = record(value);
    const riskCeiling = input?.riskCeiling;
    const approvalRequiredFrom = input?.approvalRequiredFrom;
    const allowedPaths = input?.allowedPaths;
    const valid = input !== null &&
        RISKS.has(riskCeiling) &&
        RISKS.has(approvalRequiredFrom) &&
        typeof input.allowExternalNetwork === "boolean" &&
        typeof input.allowFilesystemWrite === "boolean" &&
        typeof input.allowShellExecution === "boolean" &&
        typeof input.allowScreenControl === "boolean" &&
        Array.isArray(allowedPaths) &&
        allowedPaths.every((path) => typeof path === "string");
    if (!valid) {
        diagnosticCodes.push("agent_permission_profile_invalid");
        return invalidPermission();
    }
    return {
        riskCeiling: riskCeiling,
        approvalRequiredFrom: approvalRequiredFrom,
        allowExternalNetwork: input.allowExternalNetwork,
        allowFilesystemWrite: input.allowFilesystemWrite,
        allowShellExecution: input.allowShellExecution,
        allowScreenControl: input.allowScreenControl,
        allowedPathCount: allowedPaths.length,
    };
}
export function buildAgentOperationalSettingsProjection(source) {
    if (!AGENT_REF_PATTERN.test(source.agentRef))
        throw new Error("agent_settings_public_ref_invalid");
    if (!Number.isInteger(source.profileVersion) || source.profileVersion < 0)
        throw new Error("agent_settings_revision_invalid");
    if (!STATUSES.has(source.status))
        throw new Error("agent_settings_status_invalid");
    if (!Number.isFinite(source.observedAt) || source.observedAt < 0)
        throw new Error("agent_settings_observed_at_invalid");
    const diagnosticCodes = [];
    return Object.freeze({
        agentRef: source.agentRef,
        status: source.status,
        revision: source.profileVersion,
        model: Object.freeze(projectModel(source.modelProfile, diagnosticCodes)),
        memory: Object.freeze(projectMemory(source.memoryPolicy, diagnosticCodes)),
        permission: Object.freeze(projectPermission(source.permissionProfile, diagnosticCodes)),
        diagnosticCodes: Object.freeze([...new Set(diagnosticCodes)]),
        observedAt: source.observedAt,
    });
}
//# sourceMappingURL=agent-operational-settings-projection.js.map