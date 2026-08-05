export const SUB_AGENT_CONTRACT_SCHEMA_VERSION = 1;
export const AGENT_STATUSES = [
    "enabled",
    "disabled",
    "archived",
    "degraded",
];
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function addIssue(issues, path, message) {
    issues.push({ path, code: "contract_validation_failed", message });
}
function collapseAgentNameWhitespace(value) {
    return value.trim().replace(/\s+/gu, " ");
}
export function normalizeAgentNameSnapshot(value) {
    return collapseAgentNameWhitespace(value);
}
export function normalizeAgentName(value) {
    return collapseAgentNameWhitespace(value).toLowerCase();
}
export const DEFAULT_KNOWBEE_AGENT_NAME = "Knowbee";
export function findAgentNameNamespaceConflict(entries) {
    const seen = new Map();
    for (const entry of entries) {
        const normalizedAgentName = normalizeAgentName(entry.agentNameSnapshot);
        if (!normalizedAgentName)
            continue;
        const existing = seen.get(normalizedAgentName);
        if (existing &&
            (existing.entityType !== entry.entityType || existing.entityId !== entry.entityId)) {
            return {
                normalizedAgentName,
                existing,
                attempted: entry,
            };
        }
        seen.set(normalizedAgentName, entry);
    }
    return undefined;
}
export function resolveAgentConfigAgentName(config) {
    const agentName = normalizeAgentNameSnapshot(config.agentName ?? "");
    if (agentName)
        return agentName;
    return config.agentType === "knowbee" ? DEFAULT_KNOWBEE_AGENT_NAME : "Unnamed sub-agent";
}
export function buildAgentNameSnapshotFromAgentConfig(config) {
    const agentName = resolveAgentConfigAgentName(config);
    return {
        entityType: config.agentType,
        entityId: config.agentId,
        agentName,
        agentNameSnapshot: agentName,
    };
}
const USER_FACING_DISPLAY_NAME_ALIASES = ["displayName", "display_name", "nameForDisplay"];
const INTERNAL_IDENTIFIER_PREFIXES = ["agent:", "team:", "session:", "sub_session:"];
function rejectUserFacingDisplayNameAliases(record, path, issues) {
    for (const key of USER_FACING_DISPLAY_NAME_ALIASES) {
        if (key in record)
            addIssue(issues, `${path}.${key}`, `${key} is not allowed in user-facing agent name attribution contracts.`);
    }
}
function hasNonEmptyString(record, key, path, issues) {
    if (typeof record[key] === "string" && record[key].trim())
        return true;
    addIssue(issues, `${path}.${key}`, `${key} must be a non-empty string.`);
    return false;
}
function hasNonEmptyAgentName(record, key, path, issues) {
    if (typeof record[key] === "string" && normalizeAgentName(record[key]).length > 0)
        return true;
    addIssue(issues, `${path}.${key}`, `${key} must be a non-empty agent name.`);
    return false;
}
function looksLikeInternalIdentifier(value) {
    if (typeof value !== "string")
        return false;
    const normalized = normalizeAgentName(value);
    return INTERNAL_IDENTIFIER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
function validateAgentConfigNameFields(record, path, issues) {
    const agentNameIsPresent = hasNonEmptyAgentName(record, "agentName", path, issues);
    if (agentNameIsPresent &&
        typeof record.agentName === "string" &&
        typeof record.agentId === "string" &&
        normalizeAgentName(record.agentName) === normalizeAgentName(record.agentId)) {
        addIssue(issues, `${path}.agentName`, "agentName must be a user-facing name, not the internal agentId.");
    }
    else if (agentNameIsPresent && looksLikeInternalIdentifier(record.agentName)) {
        addIssue(issues, `${path}.agentName`, "agentName must not use internal identifier syntax.");
    }
    if ("normalizedAgentName" in record && record.normalizedAgentName !== undefined) {
        const normalizedAgentNameIsPresent = hasNonEmptyAgentName(record, "normalizedAgentName", path, issues);
        if (normalizedAgentNameIsPresent && looksLikeInternalIdentifier(record.normalizedAgentName)) {
            addIssue(issues, `${path}.normalizedAgentName`, "normalizedAgentName must not use internal identifier syntax.");
        }
        if (typeof record.agentName === "string" &&
            typeof record.normalizedAgentName === "string" &&
            normalizedAgentNameIsPresent) {
            const expected = normalizeAgentName(record.agentName);
            const actual = normalizeAgentName(record.normalizedAgentName);
            if (actual !== expected) {
                addIssue(issues, `${path}.normalizedAgentName`, "normalizedAgentName must match the normalized agentName.");
            }
        }
    }
    for (const key of USER_FACING_DISPLAY_NAME_ALIASES) {
        if (key in record)
            addIssue(issues, `${path}.${key}`, `${key} is not allowed in agent config; use agentName.`);
    }
    if ("nickname" in record) {
        addIssue(issues, `${path}.nickname`, "nickname is not allowed in agent config; use agentName.");
    }
    if ("normalizedNickname" in record) {
        addIssue(issues, `${path}.normalizedNickname`, "normalizedNickname is not allowed in agent config; use normalizedAgentName.");
    }
}
function hasArray(record, key, path, issues) {
    if (Array.isArray(record[key]))
        return true;
    addIssue(issues, `${path}.${key}`, `${key} must be an array.`);
    return false;
}
const RELATIONSHIP_ENTITY_TYPES = new Set([
    "knowbee",
    "sub_agent",
    "team",
    "session",
    "sub_session",
    "capability",
    "data_exchange",
]);
const OWNER_SCOPE_TYPES = new Set(["knowbee", "sub_agent", "team", "system"]);
const CAPABILITY_RISK_LEVELS = new Set([
    "safe",
    "moderate",
    "external",
    "sensitive",
    "dangerous",
]);
const TEAM_RESULT_POLICY_MODES = new Set([
    "lead_synthesis",
    "owner_synthesis",
    "reviewer_required",
    "verifier_required",
    "quorum_required",
]);
const TEAM_CONFLICT_POLICY_MODES = new Set([
    "lead_decides",
    "owner_decides",
    "reviewer_decides",
    "report_conflict",
]);
const TEAM_EXECUTION_TASK_KINDS = new Set([
    "member",
    "synthesis",
    "review",
    "verification",
]);
const TEAM_MEMBERSHIP_STATUSES = new Set([
    "active",
    "inactive",
    "fallback_only",
    "removed",
]);
const AGENT_RELATIONSHIP_STATUSES = new Set([
    "active",
    "disabled",
    "archived",
]);
const FEEDBACK_TARGET_AGENT_POLICIES = new Set([
    "same_agent",
    "alternative_direct_child",
    "parent_decides",
    "fallback_agent",
    "lead_assigns",
    "knowbee_direct",
]);
const DATA_EXCHANGE_ALLOWED_USE = new Set([
    "temporary_context",
    "memory_candidate",
    "verification_only",
]);
const DATA_EXCHANGE_REDACTION_STATES = new Set([
    "redacted",
    "not_sensitive",
    "blocked",
]);
const DATA_EXCHANGE_RETENTION_POLICIES = new Set([
    "session_only",
    "short_term",
    "long_term_candidate",
    "discard_after_review",
]);
const RESULT_REPORT_STATUSES = new Set([
    "completed",
    "needs_revision",
    "failed",
]);
const RESULT_OUTPUT_STATUSES = new Set([
    "satisfied",
    "missing",
    "partial",
]);
const RESULT_REPORT_IMPOSSIBLE_REASON_KINDS = new Set([
    "physical",
    "logical",
    "policy",
]);
const EXPECTED_OUTPUT_KINDS = new Set([
    "text",
    "artifact",
    "tool_result",
    "data_package",
    "state_change",
]);
const MEMORY_VISIBILITIES = new Set([
    "private",
    "coordinator_visible",
    "team_visible",
]);
const MEMORY_RETENTION_POLICIES = new Set([
    "session",
    "short_term",
    "long_term",
]);
const MEMORY_CAPSULE_MODES = new Set([
    "session_compaction",
    "rolling_summary",
]);
const MEMORY_ARCHIVE_REFERENCE_MODES = new Set([
    "summary_reference",
    "full_reference_disabled",
]);
const RESOURCE_LOCK_KINDS = new Set([
    "file",
    "display",
    "channel",
    "mcp_server",
    "secret_scope",
    "external_target",
    "custom",
]);
const SUB_SESSION_STATUSES = new Set([
    "created",
    "queued",
    "running",
    "waiting_for_input",
    "awaiting_approval",
    "completed",
    "needs_revision",
    "failed",
    "cancelled",
]);
function hasBoolean(record, key, path, issues) {
    if (typeof record[key] === "boolean")
        return true;
    addIssue(issues, `${path}.${key}`, `${key} must be a boolean.`);
    return false;
}
function hasFiniteNumber(record, key, path, issues, options = {}) {
    if (typeof record[key] === "number" &&
        Number.isFinite(record[key]) &&
        (options.min === undefined || record[key] >= options.min)) {
        return true;
    }
    const qualifier = options.min === undefined
        ? "a finite number"
        : `a finite number greater than or equal to ${options.min}`;
    addIssue(issues, `${path}.${key}`, `${key} must be ${qualifier}.`);
    return false;
}
function optionalNonNegativeIntegerIsValid(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function validateOptionalNonNegativeInteger(record, key, path, issues) {
    if (!(key in record) || record[key] === undefined)
        return true;
    if (optionalNonNegativeIntegerIsValid(record[key]))
        return true;
    addIssue(issues, `${path}.${key}`, `${key} must be a non-negative integer.`);
    return false;
}
function validateOptionalBoolean(record, key, path, issues) {
    if (!(key in record) || record[key] === undefined)
        return true;
    if (typeof record[key] === "boolean")
        return true;
    addIssue(issues, `${path}.${key}`, `${key} must be a boolean.`);
    return false;
}
function validateStringArray(value, path, issues, options = {}) {
    if (!Array.isArray(value)) {
        addIssue(issues, path, `${path.split(".").pop() ?? "value"} must be an array.`);
        return false;
    }
    let ok = true;
    for (const [index, item] of value.entries()) {
        if (typeof item !== "string") {
            addIssue(issues, `${path}[${index}]`, "Array items must be strings.");
            ok = false;
            continue;
        }
        if (options.requireNonEmptyItems && !item.trim()) {
            addIssue(issues, `${path}[${index}]`, "Array items must be non-empty strings.");
            ok = false;
        }
    }
    return ok;
}
function validateOwnerScope(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "owner scope must be an object.");
        return false;
    }
    if (typeof value.ownerType !== "string" ||
        !OWNER_SCOPE_TYPES.has(value.ownerType)) {
        addIssue(issues, `${path}.ownerType`, "ownerType must be knowbee, sub_agent, team, or system.");
    }
    hasNonEmptyString(value, "ownerId", path, issues);
    return true;
}
function expectedAgentOwnerScope(value) {
    if ((value.agentType === "knowbee" || value.agentType === "sub_agent") &&
        typeof value.agentId === "string" &&
        value.agentId.trim().length > 0) {
        return { ownerType: value.agentType, ownerId: value.agentId };
    }
    return undefined;
}
function ownerScopeMatches(value, expected) {
    return (isRecord(value) &&
        value.ownerType === expected.ownerType &&
        typeof value.ownerId === "string" &&
        value.ownerId.trim() === expected.ownerId.trim());
}
function validateMemoryPolicyAgentOwnerScope(value, path, expectedOwner, issues) {
    if (!expectedOwner || !isRecord(value))
        return;
    if (!ownerScopeMatches(value.owner, expectedOwner)) {
        addIssue(issues, `${path}.owner`, "memoryPolicy.owner must match the agent owner scope.");
    }
    if (Array.isArray(value.readScopes)) {
        value.readScopes.forEach((scope, index) => {
            if (!ownerScopeMatches(scope, expectedOwner)) {
                addIssue(issues, `${path}.readScopes[${index}]`, "memoryPolicy.readScopes must include only the agent owner scope.");
            }
        });
    }
    if (!ownerScopeMatches(value.writeScope, expectedOwner)) {
        addIssue(issues, `${path}.writeScope`, "memoryPolicy.writeScope must match the agent owner scope.");
    }
}
function validateMemoryPolicy(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "memoryPolicy must be an object.");
        return false;
    }
    validateOwnerScope(value.owner, `${path}.owner`, issues);
    if (typeof value.visibility !== "string" ||
        !MEMORY_VISIBILITIES.has(value.visibility)) {
        addIssue(issues, `${path}.visibility`, "visibility must be private, coordinator_visible, or team_visible.");
    }
    if (Array.isArray(value.readScopes)) {
        value.readScopes.forEach((scope, index) => validateOwnerScope(scope, `${path}.readScopes[${index}]`, issues));
    }
    else {
        addIssue(issues, `${path}.readScopes`, "readScopes must be an array.");
    }
    validateOwnerScope(value.writeScope, `${path}.writeScope`, issues);
    if (typeof value.retentionPolicy !== "string" ||
        !MEMORY_RETENTION_POLICIES.has(value.retentionPolicy)) {
        addIssue(issues, `${path}.retentionPolicy`, "retentionPolicy must be session, short_term, or long_term.");
    }
    if (typeof value.writebackReviewRequired !== "boolean") {
        addIssue(issues, `${path}.writebackReviewRequired`, "writebackReviewRequired must be a boolean.");
    }
    const rawWindowSizeIsValid = validateOptionalNonNegativeInteger(value, "rawWindowSize", path, issues);
    const compactThresholdIsValid = validateOptionalNonNegativeInteger(value, "compactThreshold", path, issues);
    if ("capsuleMode" in value &&
        value.capsuleMode !== undefined &&
        (typeof value.capsuleMode !== "string" ||
            !MEMORY_CAPSULE_MODES.has(value.capsuleMode))) {
        addIssue(issues, `${path}.capsuleMode`, "capsuleMode must be session_compaction or rolling_summary.");
    }
    if ("archiveReferenceMode" in value &&
        value.archiveReferenceMode !== undefined &&
        (typeof value.archiveReferenceMode !== "string" ||
            !MEMORY_ARCHIVE_REFERENCE_MODES.has(value.archiveReferenceMode))) {
        addIssue(issues, `${path}.archiveReferenceMode`, "archiveReferenceMode must be summary_reference or full_reference_disabled.");
    }
    validateOptionalBoolean(value, "handoffCapsuleAllowed", path, issues);
    validateOptionalNonNegativeInteger(value, "lastCompactedAt", path, issues);
    validateOptionalNonNegativeInteger(value, "capsuleCount", path, issues);
    if (rawWindowSizeIsValid &&
        compactThresholdIsValid &&
        optionalNonNegativeIntegerIsValid(value.rawWindowSize) &&
        optionalNonNegativeIntegerIsValid(value.compactThreshold) &&
        value.compactThreshold < value.rawWindowSize) {
        addIssue(issues, `${path}.compactThreshold`, "compactThreshold must be greater than or equal to rawWindowSize.");
    }
    return true;
}
function validatePermissionProfile(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "permissionProfile must be an object.");
        return false;
    }
    hasNonEmptyString(value, "profileId", path, issues);
    if (typeof value.riskCeiling !== "string" ||
        !CAPABILITY_RISK_LEVELS.has(value.riskCeiling)) {
        addIssue(issues, `${path}.riskCeiling`, "riskCeiling must be a supported capability risk level.");
    }
    if (typeof value.approvalRequiredFrom !== "string" ||
        !CAPABILITY_RISK_LEVELS.has(value.approvalRequiredFrom)) {
        addIssue(issues, `${path}.approvalRequiredFrom`, "approvalRequiredFrom must be a supported capability risk level.");
    }
    for (const key of [
        "allowExternalNetwork",
        "allowFilesystemWrite",
        "allowShellExecution",
        "allowScreenControl",
    ]) {
        hasBoolean(value, key, path, issues);
    }
    validateStringArray(value.allowedPaths, `${path}.allowedPaths`, issues);
    return true;
}
function validateSkillMcpAllowlist(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "skillMcpAllowlist must be an object.");
        return false;
    }
    validateStringArray(value.enabledSkillIds, `${path}.enabledSkillIds`, issues);
    validateStringArray(value.enabledMcpServerIds, `${path}.enabledMcpServerIds`, issues);
    validateStringArray(value.enabledToolNames, `${path}.enabledToolNames`, issues);
    validateStringArray(value.disabledToolNames, `${path}.disabledToolNames`, issues);
    if ("secretScopeId" in value &&
        value.secretScopeId !== undefined &&
        value.secretScopeId !== null &&
        !`${value.secretScopeId}`.trim()) {
        addIssue(issues, `${path}.secretScopeId`, "secretScopeId must be a non-empty string when present.");
    }
    return true;
}
function validateCapabilityPolicy(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "capabilityPolicy must be an object.");
        return false;
    }
    validatePermissionProfile(value.permissionProfile, `${path}.permissionProfile`, issues);
    validateSkillMcpAllowlist(value.skillMcpAllowlist, `${path}.skillMcpAllowlist`, issues);
    if (!isRecord(value.rateLimit)) {
        addIssue(issues, `${path}.rateLimit`, "rateLimit must be an object.");
    }
    else {
        hasFiniteNumber(value.rateLimit, "maxConcurrentCalls", `${path}.rateLimit`, issues, { min: 1 });
        if ("maxCallsPerMinute" in value.rateLimit && value.rateLimit.maxCallsPerMinute !== undefined) {
            hasFiniteNumber(value.rateLimit, "maxCallsPerMinute", `${path}.rateLimit`, issues, { min: 1 });
        }
    }
    return true;
}
function validateModelProfile(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "modelProfile must be an object.");
        return false;
    }
    hasNonEmptyString(value, "providerId", path, issues);
    hasNonEmptyString(value, "modelId", path, issues);
    for (const key of ["effort"]) {
        if (key in value && value[key] !== undefined && typeof value[key] !== "string") {
            addIssue(issues, `${path}.${key}`, `${key} must be a string when present.`);
        }
    }
    for (const key of [
        "temperature",
        "maxOutputTokens",
        "timeoutMs",
        "retryCount",
        "costBudget",
    ]) {
        if (key in value && value[key] !== undefined)
            hasFiniteNumber(value, key, path, issues, { min: 0 });
    }
    if ("fallbackModelId" in value &&
        value.fallbackModelId !== undefined &&
        typeof value.fallbackModelId !== "string") {
        addIssue(issues, `${path}.fallbackModelId`, "fallbackModelId must be a string when present.");
    }
    return true;
}
function validateDelegationPolicy(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "delegationPolicy must be an object.");
        return false;
    }
    hasBoolean(value, "enabled", path, issues);
    hasFiniteNumber(value, "maxParallelSessions", path, issues, { min: 1 });
    return true;
}
function validateExpectedOutputContract(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "ExpectedOutputContract must be an object.");
        return false;
    }
    hasNonEmptyString(value, "outputId", path, issues);
    if (typeof value.kind !== "string" ||
        !EXPECTED_OUTPUT_KINDS.has(value.kind)) {
        addIssue(issues, `${path}.kind`, "kind must be text, artifact, tool_result, data_package, or state_change.");
    }
    hasNonEmptyString(value, "description", path, issues);
    hasBoolean(value, "required", path, issues);
    if (!isRecord(value.acceptance)) {
        addIssue(issues, `${path}.acceptance`, "acceptance must be an object.");
    }
    else {
        if ("statusField" in value.acceptance &&
            value.acceptance.statusField !== undefined &&
            typeof value.acceptance.statusField !== "string") {
            addIssue(issues, `${path}.acceptance.statusField`, "statusField must be a string when present.");
        }
        validateStringArray(value.acceptance.requiredEvidenceKinds, `${path}.acceptance.requiredEvidenceKinds`, issues);
        if (typeof value.acceptance.artifactRequired !== "boolean") {
            addIssue(issues, `${path}.acceptance.artifactRequired`, "artifactRequired must be a boolean.");
        }
        validateStringArray(value.acceptance.reasonCodes, `${path}.acceptance.reasonCodes`, issues, {
            requireNonEmptyItems: true,
        });
    }
    return true;
}
function validateStructuredTaskScope(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "taskScope must be an object.");
        return false;
    }
    hasNonEmptyString(value, "goal", path, issues);
    hasNonEmptyString(value, "intentType", path, issues);
    hasNonEmptyString(value, "actionType", path, issues);
    validateStringArray(value.constraints, `${path}.constraints`, issues);
    if (Array.isArray(value.expectedOutputs)) {
        value.expectedOutputs.forEach((output, index) => validateExpectedOutputContract(output, `${path}.expectedOutputs[${index}]`, issues));
    }
    else {
        addIssue(issues, `${path}.expectedOutputs`, "expectedOutputs must be an array.");
    }
    validateStringArray(value.reasonCodes, `${path}.reasonCodes`, issues, {
        requireNonEmptyItems: true,
    });
    return true;
}
export function validateTeamMembership(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "TeamMembership must be an object.",
                },
            ],
        };
    }
    hasNonEmptyString(value, "membershipId", "$", issues);
    hasNonEmptyString(value, "teamId", "$", issues);
    hasNonEmptyString(value, "agentId", "$", issues);
    if ("ownerAgentIdSnapshot" in value &&
        value.ownerAgentIdSnapshot !== undefined &&
        typeof value.ownerAgentIdSnapshot !== "string") {
        addIssue(issues, "$.ownerAgentIdSnapshot", "ownerAgentIdSnapshot must be a string when present.");
    }
    validateStringArray(value.teamRoles, "$.teamRoles", issues, { requireNonEmptyItems: true });
    hasNonEmptyString(value, "primaryRole", "$", issues);
    hasBoolean(value, "required", "$", issues);
    if ("fallbackForAgentId" in value &&
        value.fallbackForAgentId !== undefined &&
        typeof value.fallbackForAgentId !== "string") {
        addIssue(issues, "$.fallbackForAgentId", "fallbackForAgentId must be a string when present.");
    }
    hasFiniteNumber(value, "sortOrder", "$", issues, { min: 0 });
    if (typeof value.status !== "string" ||
        !TEAM_MEMBERSHIP_STATUSES.has(value.status)) {
        addIssue(issues, "$.status", "status must be active, inactive, fallback_only, or removed.");
    }
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateAgentRelationship(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "AgentRelationship must be an object.",
                },
            ],
        };
    }
    hasNonEmptyString(value, "edgeId", "$", issues);
    hasNonEmptyString(value, "parentAgentId", "$", issues);
    hasNonEmptyString(value, "childAgentId", "$", issues);
    if (value.relationshipType !== "parent_child") {
        addIssue(issues, "$.relationshipType", "relationshipType must be parent_child.");
    }
    if (typeof value.parentAgentId === "string" &&
        typeof value.childAgentId === "string" &&
        value.parentAgentId === value.childAgentId) {
        addIssue(issues, "$.childAgentId", "parentAgentId and childAgentId must be different.");
    }
    if (typeof value.status !== "string" ||
        !AGENT_RELATIONSHIP_STATUSES.has(value.status)) {
        addIssue(issues, "$.status", "status must be active, disabled, or archived.");
    }
    hasFiniteNumber(value, "sortOrder", "$", issues, { min: 0 });
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
function validateRuntimeIdentity(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "identity must be an object.");
        return false;
    }
    if (value.schemaVersion !== SUB_AGENT_CONTRACT_SCHEMA_VERSION)
        addIssue(issues, `${path}.schemaVersion`, "Unsupported contract schema version.");
    if (typeof value.entityType !== "string" ||
        !RELATIONSHIP_ENTITY_TYPES.has(value.entityType)) {
        addIssue(issues, `${path}.entityType`, "entityType must be knowbee, sub_agent, team, session, sub_session, capability, or data_exchange.");
    }
    hasNonEmptyString(value, "entityId", path, issues);
    hasNonEmptyString(value, "idempotencyKey", path, issues);
    validateOwnerScope(value.owner, `${path}.owner`, issues);
    return true;
}
function validateAgentNameSnapshot(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "agent name attribution snapshot must be an object.");
        return false;
    }
    rejectUserFacingDisplayNameAliases(value, path, issues);
    if (value.entityType !== "knowbee" &&
        value.entityType !== "sub_agent" &&
        value.entityType !== "team") {
        addIssue(issues, `${path}.entityType`, "entityType must be knowbee, sub_agent, or team.");
    }
    hasNonEmptyString(value, "entityId", path, issues);
    hasNonEmptyString(value, "agentNameSnapshot", path, issues);
    if ("agentName" in value && value.agentName !== undefined) {
        hasNonEmptyString(value, "agentName", path, issues);
        if (typeof value.agentName === "string" &&
            typeof value.agentNameSnapshot === "string" &&
            normalizeAgentNameSnapshot(value.agentName) !== normalizeAgentNameSnapshot(value.agentNameSnapshot)) {
            addIssue(issues, `${path}.agentName`, "agentName must match agentNameSnapshot.");
        }
    }
    return true;
}
function validateAgentAttributionSnapshot(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "agent name attribution snapshot must be an object.");
        return false;
    }
    return validateAgentNameSnapshot(value, path, issues);
}
function usesExtendedTeamShape(value) {
    return [
        "ownerAgentId",
        "leadAgentId",
        "memberCountMin",
        "memberCountMax",
        "requiredTeamRoles",
        "requiredCapabilityTags",
        "resultPolicy",
        "conflictPolicy",
        "memberships",
    ].some((key) => key in value);
}
function validateOrchestrationTask(value, path, issues, expectedExecutionKind) {
    if (!isRecord(value)) {
        addIssue(issues, path, "OrchestrationTask must be an object.");
        return false;
    }
    hasNonEmptyString(value, "taskId", path, issues);
    if (typeof value.executionKind !== "string" ||
        (value.executionKind !== "direct_knowbee" && value.executionKind !== "delegated_sub_agent")) {
        addIssue(issues, `${path}.executionKind`, "executionKind must be direct_knowbee or delegated_sub_agent.");
    }
    else if (expectedExecutionKind && value.executionKind !== expectedExecutionKind) {
        addIssue(issues, `${path}.executionKind`, `executionKind must be ${expectedExecutionKind} in this task group.`);
    }
    validateStructuredTaskScope(value.scope, `${path}.scope`, issues);
    if ("assignedAgentId" in value &&
        value.assignedAgentId !== undefined &&
        typeof value.assignedAgentId !== "string") {
        addIssue(issues, `${path}.assignedAgentId`, "assignedAgentId must be a string when present.");
    }
    if ("assignedTeamId" in value &&
        value.assignedTeamId !== undefined &&
        typeof value.assignedTeamId !== "string") {
        addIssue(issues, `${path}.assignedTeamId`, "assignedTeamId must be a string when present.");
    }
    validateStringArray(value.requiredCapabilities, `${path}.requiredCapabilities`, issues, {
        requireNonEmptyItems: true,
    });
    validateStringArray(value.resourceLockIds, `${path}.resourceLockIds`, issues, {
        requireNonEmptyItems: true,
    });
    if ("planningTrace" in value && value.planningTrace !== undefined) {
        if (!isRecord(value.planningTrace)) {
            addIssue(issues, `${path}.planningTrace`, "planningTrace must be an object when present.");
        }
        else {
            if ("score" in value.planningTrace && value.planningTrace.score !== undefined) {
                hasFiniteNumber(value.planningTrace, "score", `${path}.planningTrace`, issues);
            }
            if ("selectedSource" in value.planningTrace &&
                value.planningTrace.selectedSource !== undefined &&
                value.planningTrace.selectedSource !== "execution_decision") {
                addIssue(issues, `${path}.planningTrace.selectedSource`, "selectedSource must be execution_decision when present.");
            }
            for (const key of ["selectedExecutorId", "rejectedExecutorId"]) {
                if (key in value.planningTrace &&
                    value.planningTrace[key] !== undefined &&
                    typeof value.planningTrace[key] !== "string") {
                    addIssue(issues, `${path}.planningTrace.${key}`, `${key} must be a string when present.`);
                }
            }
            validateStringArray(value.planningTrace.reasonCodes, `${path}.planningTrace.reasonCodes`, issues, { requireNonEmptyItems: true });
            if ("excludedReasonCodes" in value.planningTrace &&
                value.planningTrace.excludedReasonCodes !== undefined) {
                validateStringArray(value.planningTrace.excludedReasonCodes, `${path}.planningTrace.excludedReasonCodes`, issues, {
                    requireNonEmptyItems: true,
                });
            }
            if ("rejectedReasonCodes" in value.planningTrace &&
                value.planningTrace.rejectedReasonCodes !== undefined) {
                validateStringArray(value.planningTrace.rejectedReasonCodes, `${path}.planningTrace.rejectedReasonCodes`, issues, {
                    requireNonEmptyItems: true,
                });
            }
        }
    }
    return true;
}
function validateTeamExecutionTaskSnapshot(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "TeamExecutionTaskSnapshot must be an object.");
        return false;
    }
    hasNonEmptyString(value, "taskId", path, issues);
    if (typeof value.taskKind !== "string" ||
        !TEAM_EXECUTION_TASK_KINDS.has(value.taskKind)) {
        addIssue(issues, `${path}.taskKind`, "taskKind must be member, synthesis, review, or verification.");
    }
    validateOrchestrationTask(value, path, issues);
    if (!isRecord(value.inputContext))
        addIssue(issues, `${path}.inputContext`, "inputContext must be an object.");
    if (Array.isArray(value.expectedOutputs)) {
        value.expectedOutputs.forEach((output, index) => validateExpectedOutputContract(output, `${path}.expectedOutputs[${index}]`, issues));
    }
    else {
        addIssue(issues, `${path}.expectedOutputs`, "expectedOutputs must be an array.");
    }
    validateStringArray(value.validationCriteria, `${path}.validationCriteria`, issues, {
        requireNonEmptyItems: true,
    });
    validateStringArray(value.dependsOnTaskIds, `${path}.dependsOnTaskIds`, issues, {
        requireNonEmptyItems: true,
    });
    hasBoolean(value, "required", path, issues);
    validateStringArray(value.reasonCodes, `${path}.reasonCodes`, issues, {
        requireNonEmptyItems: true,
    });
    return true;
}
function validateDependencyEdge(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "DependencyEdgeContract must be an object.");
        return false;
    }
    hasNonEmptyString(value, "fromTaskId", path, issues);
    hasNonEmptyString(value, "toTaskId", path, issues);
    hasNonEmptyString(value, "reasonCode", path, issues);
    return true;
}
function validateResourceLock(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "ResourceLockContract must be an object.");
        return false;
    }
    hasNonEmptyString(value, "lockId", path, issues);
    if (typeof value.kind !== "string" || !RESOURCE_LOCK_KINDS.has(value.kind)) {
        addIssue(issues, `${path}.kind`, "kind must be a supported resource lock kind.");
    }
    hasNonEmptyString(value, "target", path, issues);
    if (value.mode !== "shared" && value.mode !== "exclusive") {
        addIssue(issues, `${path}.mode`, "mode must be shared or exclusive.");
    }
    hasNonEmptyString(value, "reasonCode", path, issues);
    return true;
}
function validateParallelSubSessionGroup(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "ParallelSubSessionGroup must be an object.");
        return false;
    }
    hasNonEmptyString(value, "groupId", path, issues);
    hasNonEmptyString(value, "parentRunId", path, issues);
    validateStringArray(value.subSessionIds, `${path}.subSessionIds`, issues, {
        requireNonEmptyItems: true,
    });
    if (Array.isArray(value.dependencyEdges)) {
        value.dependencyEdges.forEach((edge, index) => validateDependencyEdge(edge, `${path}.dependencyEdges[${index}]`, issues));
    }
    else {
        addIssue(issues, `${path}.dependencyEdges`, "dependencyEdges must be an array.");
    }
    if (Array.isArray(value.resourceLocks)) {
        value.resourceLocks.forEach((lock, index) => validateResourceLock(lock, `${path}.resourceLocks[${index}]`, issues));
    }
    else {
        addIssue(issues, `${path}.resourceLocks`, "resourceLocks must be an array.");
    }
    hasFiniteNumber(value, "concurrencyLimit", path, issues, { min: 1 });
    if (value.status !== "planned" &&
        value.status !== "running" &&
        value.status !== "completed" &&
        value.status !== "blocked" &&
        value.status !== "failed") {
        addIssue(issues, `${path}.status`, "status must be planned, running, completed, blocked, or failed.");
    }
    return true;
}
function validateApprovalRequirement(value, path, issues) {
    if (!isRecord(value)) {
        addIssue(issues, path, "ApprovalRequirementContract must be an object.");
        return false;
    }
    hasNonEmptyString(value, "approvalId", path, issues);
    hasNonEmptyString(value, "taskId", path, issues);
    if ("agentId" in value && value.agentId !== undefined && typeof value.agentId !== "string") {
        addIssue(issues, `${path}.agentId`, "agentId must be a string when present.");
    }
    hasNonEmptyString(value, "capability", path, issues);
    if (typeof value.risk !== "string" ||
        !CAPABILITY_RISK_LEVELS.has(value.risk)) {
        addIssue(issues, `${path}.risk`, "risk must be a supported capability risk level.");
    }
    hasNonEmptyString(value, "reasonCode", path, issues);
    return true;
}
export function validateAgentConfig(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "Agent config must be an object.",
                },
            ],
        };
    }
    if (value.schemaVersion !== SUB_AGENT_CONTRACT_SCHEMA_VERSION)
        addIssue(issues, "$.schemaVersion", "Unsupported contract schema version.");
    if (value.agentType !== "knowbee" && value.agentType !== "sub_agent") {
        addIssue(issues, "$.agentType", "agentType must be knowbee or sub_agent.");
    }
    if (!AGENT_STATUSES.includes(value.status)) {
        addIssue(issues, "$.status", "status must be enabled, disabled, archived, or degraded.");
    }
    hasNonEmptyString(value, "agentId", "$", issues);
    validateAgentConfigNameFields(value, "$", issues);
    hasNonEmptyString(value, "role", "$", issues);
    hasNonEmptyString(value, "personality", "$", issues);
    validateStringArray(value.specialtyTags, "$.specialtyTags", issues, {
        requireNonEmptyItems: true,
    });
    validateStringArray(value.avoidTasks, "$.avoidTasks", issues);
    if ("modelProfile" in value && value.modelProfile !== undefined)
        validateModelProfile(value.modelProfile, "$.modelProfile", issues);
    validateMemoryPolicy(value.memoryPolicy, "$.memoryPolicy", issues);
    validateMemoryPolicyAgentOwnerScope(value.memoryPolicy, "$.memoryPolicy", expectedAgentOwnerScope(value), issues);
    validateCapabilityPolicy(value.capabilityPolicy, "$.capabilityPolicy", issues);
    if ("delegationPolicy" in value && value.delegationPolicy !== undefined) {
        validateDelegationPolicy(value.delegationPolicy, "$.delegationPolicy", issues);
    }
    hasFiniteNumber(value, "profileVersion", "$", issues, { min: 1 });
    hasFiniteNumber(value, "createdAt", "$", issues, { min: 0 });
    hasFiniteNumber(value, "updatedAt", "$", issues, { min: 0 });
    if (value.agentType === "knowbee") {
        if (!isRecord(value.coordinator)) {
            addIssue(issues, "$.coordinator", "knowbee agent requires coordinator settings.");
        }
        else {
            if (value.coordinator.defaultMode !== "single_knowbee" &&
                value.coordinator.defaultMode !== "orchestration") {
                addIssue(issues, "$.coordinator.defaultMode", "defaultMode must be single_knowbee or orchestration.");
            }
            if (value.coordinator.fallbackMode !== "single_knowbee") {
                addIssue(issues, "$.coordinator.fallbackMode", "fallbackMode must be single_knowbee.");
            }
            hasFiniteNumber(value.coordinator, "maxDelegatedSubSessions", "$.coordinator", issues, {
                min: 1,
            });
        }
    }
    if (value.agentType === "sub_agent") {
        validateStringArray(value.teamIds, "$.teamIds", issues, { requireNonEmptyItems: true });
        if ("delegation" in value && value.delegation !== undefined) {
            validateDelegationPolicy(value.delegation, "$.delegation", issues);
        }
        else if (!("delegationPolicy" in value && value.delegationPolicy !== undefined)) {
            addIssue(issues, "$.delegation", "sub_agent requires delegation or delegationPolicy settings.");
        }
    }
    if (value.agentType !== "sub_agent" && ("teamIds" in value || "delegation" in value)) {
        addIssue(issues, "$.agentType", "Only sub_agent configs can include teamIds or delegation settings.");
    }
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateTeamConfig(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "Team config must be an object.",
                },
            ],
        };
    }
    if (value.schemaVersion !== SUB_AGENT_CONTRACT_SCHEMA_VERSION)
        addIssue(issues, "$.schemaVersion", "Unsupported contract schema version.");
    hasNonEmptyString(value, "teamId", "$", issues);
    hasNonEmptyString(value, "displayName", "$", issues);
    if ("nickname" in value)
        addIssue(issues, "$.nickname", "nickname is not allowed in team config; use displayName.");
    if ("normalizedNickname" in value)
        addIssue(issues, "$.normalizedNickname", "normalizedNickname is not allowed in team config.");
    hasNonEmptyString(value, "purpose", "$", issues);
    validateStringArray(value.memberAgentIds, "$.memberAgentIds", issues, {
        requireNonEmptyItems: true,
    });
    validateStringArray(value.roleHints, "$.roleHints", issues);
    const extended = usesExtendedTeamShape(value);
    if (extended) {
        hasNonEmptyString(value, "ownerAgentId", "$", issues);
        hasNonEmptyString(value, "leadAgentId", "$", issues);
    }
    if ("memberCountMin" in value && value.memberCountMin !== undefined)
        hasFiniteNumber(value, "memberCountMin", "$", issues, { min: 0 });
    if ("memberCountMax" in value && value.memberCountMax !== undefined)
        hasFiniteNumber(value, "memberCountMax", "$", issues, { min: 0 });
    if (typeof value.memberCountMin === "number" &&
        typeof value.memberCountMax === "number" &&
        value.memberCountMin > value.memberCountMax) {
        addIssue(issues, "$.memberCountMax", "memberCountMax must be greater than or equal to memberCountMin.");
    }
    if ("requiredTeamRoles" in value && value.requiredTeamRoles !== undefined) {
        validateStringArray(value.requiredTeamRoles, "$.requiredTeamRoles", issues, {
            requireNonEmptyItems: true,
        });
    }
    if ("requiredCapabilityTags" in value && value.requiredCapabilityTags !== undefined) {
        validateStringArray(value.requiredCapabilityTags, "$.requiredCapabilityTags", issues, {
            requireNonEmptyItems: true,
        });
    }
    if ("resultPolicy" in value && value.resultPolicy !== undefined) {
        if (typeof value.resultPolicy !== "string" ||
            !TEAM_RESULT_POLICY_MODES.has(value.resultPolicy)) {
            addIssue(issues, "$.resultPolicy", "resultPolicy must be a supported team result policy.");
        }
    }
    if ("conflictPolicy" in value && value.conflictPolicy !== undefined) {
        if (typeof value.conflictPolicy !== "string" ||
            !TEAM_CONFLICT_POLICY_MODES.has(value.conflictPolicy)) {
            addIssue(issues, "$.conflictPolicy", "conflictPolicy must be a supported team conflict policy.");
        }
    }
    if ("memberships" in value && value.memberships !== undefined) {
        if (Array.isArray(value.memberships)) {
            value.memberships.forEach((membership, index) => {
                const validation = validateTeamMembership(membership);
                if (!validation.ok) {
                    for (const issue of validation.issues) {
                        addIssue(issues, `$.memberships[${index}]${issue.path === "$" ? "" : issue.path.slice(1)}`, issue.message);
                    }
                }
            });
        }
        else {
            addIssue(issues, "$.memberships", "memberships must be an array when present.");
        }
    }
    hasFiniteNumber(value, "profileVersion", "$", issues, { min: 1 });
    hasFiniteNumber(value, "createdAt", "$", issues, { min: 0 });
    hasFiniteNumber(value, "updatedAt", "$", issues, { min: 0 });
    for (const forbidden of [
        "allowedTools",
        "allowedSkills",
        "allowedMcpServers",
        "allowed_tools",
        "allowed_skills",
        "allowed_mcp_servers",
        "skillMcpAllowlist",
        "permissionProfile",
    ]) {
        if (forbidden in value)
            addIssue(issues, `$.${forbidden}`, "Teams cannot directly own tools, work abilities, external feature connections, or permission profiles.");
    }
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateTeamExecutionPlan(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "TeamExecutionPlan must be an object.",
                },
            ],
        };
    }
    hasNonEmptyString(value, "teamExecutionPlanId", "$", issues);
    hasNonEmptyString(value, "parentRunId", "$", issues);
    hasNonEmptyString(value, "teamId", "$", issues);
    if ("teamNameSnapshot" in value &&
        value.teamNameSnapshot !== undefined &&
        !(typeof value.teamNameSnapshot === "string" && normalizeAgentName(value.teamNameSnapshot))) {
        addIssue(issues, "$.teamNameSnapshot", "teamNameSnapshot must be a non-empty team name.");
    }
    if ("teamAgentNameSnapshot" in value) {
        addIssue(issues, "$.teamAgentNameSnapshot", "teamAgentNameSnapshot is not allowed; use teamNameSnapshot.");
    }
    hasNonEmptyString(value, "ownerAgentId", "$", issues);
    hasNonEmptyString(value, "leadAgentId", "$", issues);
    if (Array.isArray(value.memberTaskAssignments)) {
        value.memberTaskAssignments.forEach((assignment, index) => {
            if (!isRecord(assignment)) {
                addIssue(issues, `$.memberTaskAssignments[${index}]`, "memberTaskAssignments items must be objects.");
                return;
            }
            hasNonEmptyString(assignment, "agentId", `$.memberTaskAssignments[${index}]`, issues);
            validateStringArray(assignment.taskIds, `$.memberTaskAssignments[${index}].taskIds`, issues, {
                requireNonEmptyItems: true,
            });
            if ("role" in assignment &&
                assignment.role !== undefined &&
                typeof assignment.role !== "string") {
                addIssue(issues, `$.memberTaskAssignments[${index}].role`, "role must be a string when present.");
            }
            if ("membershipId" in assignment &&
                assignment.membershipId !== undefined &&
                typeof assignment.membershipId !== "string") {
                addIssue(issues, `$.memberTaskAssignments[${index}].membershipId`, "membershipId must be a string when present.");
            }
            if ("required" in assignment && assignment.required !== undefined) {
                hasBoolean(assignment, "required", `$.memberTaskAssignments[${index}]`, issues);
            }
            if ("executionState" in assignment &&
                assignment.executionState !== undefined &&
                typeof assignment.executionState !== "string") {
                addIssue(issues, `$.memberTaskAssignments[${index}].executionState`, "executionState must be a string when present.");
            }
            if ("taskKinds" in assignment && assignment.taskKinds !== undefined) {
                if (Array.isArray(assignment.taskKinds)) {
                    assignment.taskKinds.forEach((taskKind, taskKindIndex) => {
                        if (typeof taskKind !== "string" ||
                            !TEAM_EXECUTION_TASK_KINDS.has(taskKind)) {
                            addIssue(issues, `$.memberTaskAssignments[${index}].taskKinds[${taskKindIndex}]`, "taskKinds items must be member, synthesis, review, or verification.");
                        }
                    });
                }
                else {
                    addIssue(issues, `$.memberTaskAssignments[${index}].taskKinds`, "taskKinds must be an array when present.");
                }
            }
            if ("inputContext" in assignment && assignment.inputContext !== undefined) {
                if (!isRecord(assignment.inputContext)) {
                    addIssue(issues, `$.memberTaskAssignments[${index}].inputContext`, "inputContext must be an object when present.");
                }
            }
            if ("expectedOutputs" in assignment && assignment.expectedOutputs !== undefined) {
                if (Array.isArray(assignment.expectedOutputs)) {
                    assignment.expectedOutputs.forEach((output, outputIndex) => validateExpectedOutputContract(output, `$.memberTaskAssignments[${index}].expectedOutputs[${outputIndex}]`, issues));
                }
                else {
                    addIssue(issues, `$.memberTaskAssignments[${index}].expectedOutputs`, "expectedOutputs must be an array when present.");
                }
            }
            if ("validationCriteria" in assignment && assignment.validationCriteria !== undefined) {
                validateStringArray(assignment.validationCriteria, `$.memberTaskAssignments[${index}].validationCriteria`, issues, { requireNonEmptyItems: true });
            }
            if ("dependsOnTaskIds" in assignment && assignment.dependsOnTaskIds !== undefined) {
                validateStringArray(assignment.dependsOnTaskIds, `$.memberTaskAssignments[${index}].dependsOnTaskIds`, issues, { requireNonEmptyItems: true });
            }
            if ("fallbackForAgentId" in assignment &&
                assignment.fallbackForAgentId !== undefined &&
                typeof assignment.fallbackForAgentId !== "string") {
                addIssue(issues, `$.memberTaskAssignments[${index}].fallbackForAgentId`, "fallbackForAgentId must be a string when present.");
            }
            if ("reasonCodes" in assignment && assignment.reasonCodes !== undefined) {
                validateStringArray(assignment.reasonCodes, `$.memberTaskAssignments[${index}].reasonCodes`, issues, { requireNonEmptyItems: true });
            }
            if ("tasks" in assignment && assignment.tasks !== undefined) {
                if (Array.isArray(assignment.tasks)) {
                    assignment.tasks.forEach((task, taskIndex) => validateTeamExecutionTaskSnapshot(task, `$.memberTaskAssignments[${index}].tasks[${taskIndex}]`, issues));
                }
                else {
                    addIssue(issues, `$.memberTaskAssignments[${index}].tasks`, "tasks must be an array when present.");
                }
            }
        });
    }
    else {
        addIssue(issues, "$.memberTaskAssignments", "memberTaskAssignments must be an array.");
    }
    validateStringArray(value.reviewerAgentIds, "$.reviewerAgentIds", issues, {
        requireNonEmptyItems: true,
    });
    validateStringArray(value.verifierAgentIds, "$.verifierAgentIds", issues, {
        requireNonEmptyItems: true,
    });
    if (Array.isArray(value.fallbackAssignments)) {
        value.fallbackAssignments.forEach((assignment, index) => {
            if (!isRecord(assignment)) {
                addIssue(issues, `$.fallbackAssignments[${index}]`, "fallbackAssignments items must be objects.");
                return;
            }
            hasNonEmptyString(assignment, "missingAgentId", `$.fallbackAssignments[${index}]`, issues);
            hasNonEmptyString(assignment, "fallbackAgentId", `$.fallbackAssignments[${index}]`, issues);
            if ("reasonCode" in assignment &&
                assignment.reasonCode !== undefined &&
                typeof assignment.reasonCode !== "string") {
                addIssue(issues, `$.fallbackAssignments[${index}].reasonCode`, "reasonCode must be a string when present.");
            }
        });
    }
    else {
        addIssue(issues, "$.fallbackAssignments", "fallbackAssignments must be an array.");
    }
    if (!isRecord(value.coverageReport))
        addIssue(issues, "$.coverageReport", "coverageReport must be an object.");
    if (typeof value.conflictPolicySnapshot !== "string" ||
        !TEAM_CONFLICT_POLICY_MODES.has(value.conflictPolicySnapshot)) {
        addIssue(issues, "$.conflictPolicySnapshot", "conflictPolicySnapshot must be a supported team conflict policy.");
    }
    if (typeof value.resultPolicySnapshot !== "string" ||
        !TEAM_RESULT_POLICY_MODES.has(value.resultPolicySnapshot)) {
        addIssue(issues, "$.resultPolicySnapshot", "resultPolicySnapshot must be a supported team result policy.");
    }
    hasFiniteNumber(value, "createdAt", "$", issues, { min: 0 });
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateOrchestrationPlan(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "OrchestrationPlan must be an object.",
                },
            ],
        };
    }
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "planId", "$", issues);
    hasNonEmptyString(value, "parentRunId", "$", issues);
    hasNonEmptyString(value, "parentRequestId", "$", issues);
    if (Array.isArray(value.directKnowbeeTasks)) {
        value.directKnowbeeTasks.forEach((task, index) => validateOrchestrationTask(task, `$.directKnowbeeTasks[${index}]`, issues, "direct_knowbee"));
    }
    else {
        addIssue(issues, "$.directKnowbeeTasks", "directKnowbeeTasks must be an array.");
    }
    if (Array.isArray(value.delegatedTasks)) {
        value.delegatedTasks.forEach((task, index) => validateOrchestrationTask(task, `$.delegatedTasks[${index}]`, issues, "delegated_sub_agent"));
    }
    else {
        addIssue(issues, "$.delegatedTasks", "delegatedTasks must be an array.");
    }
    if (Array.isArray(value.dependencyEdges)) {
        value.dependencyEdges.forEach((edge, index) => validateDependencyEdge(edge, `$.dependencyEdges[${index}]`, issues));
    }
    else {
        addIssue(issues, "$.dependencyEdges", "dependencyEdges must be an array.");
    }
    if (Array.isArray(value.resourceLocks)) {
        value.resourceLocks.forEach((lock, index) => validateResourceLock(lock, `$.resourceLocks[${index}]`, issues));
    }
    else {
        addIssue(issues, "$.resourceLocks", "resourceLocks must be an array.");
    }
    if (Array.isArray(value.parallelGroups)) {
        value.parallelGroups.forEach((group, index) => validateParallelSubSessionGroup(group, `$.parallelGroups[${index}]`, issues));
    }
    else {
        addIssue(issues, "$.parallelGroups", "parallelGroups must be an array.");
    }
    if (Array.isArray(value.approvalRequirements)) {
        value.approvalRequirements.forEach((requirement, index) => {
            validateApprovalRequirement(requirement, `$.approvalRequirements[${index}]`, issues);
        });
    }
    else {
        addIssue(issues, "$.approvalRequirements", "approvalRequirements must be an array.");
    }
    if (!isRecord(value.fallbackStrategy)) {
        addIssue(issues, "$.fallbackStrategy", "fallbackStrategy must be an object.");
    }
    else {
        const fallbackMode = value.fallbackStrategy.mode;
        if (fallbackMode !== "self_solve" &&
            fallbackMode !== "direct_current_agent" &&
            fallbackMode !== "return_to_parent" &&
            fallbackMode !== "ask_parent" &&
            fallbackMode !== "ask_user" &&
            fallbackMode !== "fail_with_reason" &&
            fallbackMode !== "root_knowbee_direct" &&
            fallbackMode !== "explicit_provider" &&
            fallbackMode !== "single_knowbee") {
            addIssue(issues, "$.fallbackStrategy.mode", "fallbackStrategy.mode must be self_solve, direct_current_agent, return_to_parent, ask_parent, ask_user, fail_with_reason, root_knowbee_direct, explicit_provider, or legacy single_knowbee.");
        }
        hasNonEmptyString(value.fallbackStrategy, "reasonCode", "$.fallbackStrategy", issues);
        for (const key of [
            "currentExecutorId",
            "parentExecutorId",
            "requesterId",
            "providerTargetId",
            "unresolvedReasonCode",
            "unresolvedReason",
            "legacyWarning",
        ]) {
            if (key in value.fallbackStrategy &&
                value.fallbackStrategy[key] !== undefined &&
                typeof value.fallbackStrategy[key] !== "string") {
                addIssue(issues, `$.fallbackStrategy.${key}`, `${key} must be a string when present.`);
            }
        }
        if (fallbackMode === "explicit_provider" &&
            (typeof value.fallbackStrategy.providerTargetId !== "string" ||
                value.fallbackStrategy.providerTargetId.trim().length === 0)) {
            addIssue(issues, "$.fallbackStrategy.providerTargetId", "providerTargetId is required when fallbackStrategy.mode is explicit_provider.");
        }
        if (fallbackMode === "root_knowbee_direct" &&
            value.fallbackStrategy.currentExecutorId !== "agent:knowbee") {
            addIssue(issues, "$.fallbackStrategy.currentExecutorId", "currentExecutorId must be agent:knowbee when fallbackStrategy.mode is root_knowbee_direct.");
        }
        if ((fallbackMode === "return_to_parent" || fallbackMode === "ask_parent") &&
            (typeof value.fallbackStrategy.parentExecutorId !== "string" ||
                value.fallbackStrategy.parentExecutorId.trim().length === 0) &&
            (typeof value.fallbackStrategy.requesterId !== "string" ||
                value.fallbackStrategy.requesterId.trim().length === 0)) {
            addIssue(issues, "$.fallbackStrategy.parentExecutorId", "parentExecutorId or requesterId is required when fallbackStrategy.mode returns or asks the parent.");
        }
        if ("userMessage" in value.fallbackStrategy &&
            value.fallbackStrategy.userMessage !== undefined &&
            typeof value.fallbackStrategy.userMessage !== "string") {
            addIssue(issues, "$.fallbackStrategy.userMessage", "userMessage must be a string when present.");
        }
    }
    hasFiniteNumber(value, "createdAt", "$", issues, { min: 0 });
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateCommandRequest(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "CommandRequest must be an object.",
                },
            ],
        };
    }
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "commandRequestId", "$", issues);
    hasNonEmptyString(value, "parentRunId", "$", issues);
    hasNonEmptyString(value, "subSessionId", "$", issues);
    hasNonEmptyString(value, "targetAgentId", "$", issues);
    if ("targetAgentName" in value && value.targetAgentName !== undefined) {
        hasNonEmptyAgentName(value, "targetAgentName", "$", issues);
    }
    if ("targetAgentNameSnapshot" in value && value.targetAgentNameSnapshot !== undefined) {
        hasNonEmptyAgentName(value, "targetAgentNameSnapshot", "$", issues);
    }
    if (typeof value.targetAgentName === "string" &&
        typeof value.targetAgentNameSnapshot === "string" &&
        normalizeAgentNameSnapshot(value.targetAgentName) !== normalizeAgentNameSnapshot(value.targetAgentNameSnapshot)) {
        addIssue(issues, "$.targetAgentName", "targetAgentName must match targetAgentNameSnapshot when both are present.");
    }
    validateStructuredTaskScope(value.taskScope, "$.taskScope", issues);
    validateStringArray(value.contextPackageIds, "$.contextPackageIds", issues, {
        requireNonEmptyItems: true,
    });
    if (Array.isArray(value.expectedOutputs)) {
        value.expectedOutputs.forEach((output, index) => validateExpectedOutputContract(output, `$.expectedOutputs[${index}]`, issues));
    }
    else {
        addIssue(issues, "$.expectedOutputs", "expectedOutputs must be an array.");
    }
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateDataExchangePackage(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "DataExchangePackage must be an object.",
                },
            ],
        };
    }
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "exchangeId", "$", issues);
    validateOwnerScope(value.sourceOwner, "$.sourceOwner", issues);
    validateOwnerScope(value.recipientOwner, "$.recipientOwner", issues);
    if (!(typeof value.sourceAgentNameSnapshot === "string" && normalizeAgentName(value.sourceAgentNameSnapshot))) {
        addIssue(issues, "$.sourceAgentNameSnapshot", "sourceAgentNameSnapshot must be a non-empty agent name.");
    }
    if ("sourceAgentName" in value && value.sourceAgentName !== undefined) {
        hasNonEmptyString(value, "sourceAgentName", "$", issues);
        if (typeof value.sourceAgentName === "string" &&
            typeof value.sourceAgentNameSnapshot === "string" &&
            normalizeAgentNameSnapshot(value.sourceAgentName) !== normalizeAgentNameSnapshot(value.sourceAgentNameSnapshot)) {
            addIssue(issues, "$.sourceAgentName", "sourceAgentName must match sourceAgentNameSnapshot.");
        }
    }
    if (!(typeof value.recipientAgentNameSnapshot === "string" && normalizeAgentName(value.recipientAgentNameSnapshot))) {
        addIssue(issues, "$.recipientAgentNameSnapshot", "recipientAgentNameSnapshot must be a non-empty agent name.");
    }
    if ("recipientAgentName" in value && value.recipientAgentName !== undefined) {
        hasNonEmptyString(value, "recipientAgentName", "$", issues);
        if (typeof value.recipientAgentName === "string" &&
            typeof value.recipientAgentNameSnapshot === "string" &&
            normalizeAgentNameSnapshot(value.recipientAgentName) !==
                normalizeAgentNameSnapshot(value.recipientAgentNameSnapshot)) {
            addIssue(issues, "$.recipientAgentName", "recipientAgentName must match recipientAgentNameSnapshot.");
        }
    }
    hasNonEmptyString(value, "purpose", "$", issues);
    if (typeof value.allowedUse !== "string" ||
        !DATA_EXCHANGE_ALLOWED_USE.has(value.allowedUse)) {
        addIssue(issues, "$.allowedUse", "allowedUse must be temporary_context, memory_candidate, or verification_only.");
    }
    if (typeof value.retentionPolicy !== "string" ||
        !DATA_EXCHANGE_RETENTION_POLICIES.has(value.retentionPolicy)) {
        addIssue(issues, "$.retentionPolicy", "retentionPolicy must be a supported data exchange retention policy.");
    }
    if (typeof value.redactionState !== "string" ||
        !DATA_EXCHANGE_REDACTION_STATES.has(value.redactionState)) {
        addIssue(issues, "$.redactionState", "redactionState must be redacted, not_sensitive, or blocked.");
    }
    validateStringArray(value.provenanceRefs, "$.provenanceRefs", issues, {
        requireNonEmptyItems: true,
    });
    if (!isRecord(value.payload))
        addIssue(issues, "$.payload", "payload must be an object.");
    if ("expiresAt" in value &&
        value.expiresAt !== undefined &&
        value.expiresAt !== null &&
        typeof value.expiresAt !== "number") {
        addIssue(issues, "$.expiresAt", "expiresAt must be a number or null when present.");
    }
    hasFiniteNumber(value, "createdAt", "$", issues, { min: 0 });
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateResultReport(value, options = {}) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "ResultReport must be an object.",
                },
            ],
        };
    }
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "resultReportId", "$", issues);
    hasNonEmptyString(value, "parentRunId", "$", issues);
    hasNonEmptyString(value, "subSessionId", "$", issues);
    if ("source" in value && value.source !== undefined)
        validateAgentAttributionSnapshot(value.source, "$.source", issues);
    if (typeof value.status !== "string" ||
        !RESULT_REPORT_STATUSES.has(value.status)) {
        addIssue(issues, "$.status", "status must be completed, needs_revision, or failed.");
    }
    const reportStatus = typeof value.status === "string" ? value.status : undefined;
    const outputsById = new Map();
    if (Array.isArray(value.outputs)) {
        value.outputs.forEach((output, index) => {
            if (!isRecord(output)) {
                addIssue(issues, `$.outputs[${index}]`, "outputs items must be objects.");
                return;
            }
            hasNonEmptyString(output, "outputId", `$.outputs[${index}]`, issues);
            if (typeof output.status !== "string" ||
                !RESULT_OUTPUT_STATUSES.has(output.status)) {
                addIssue(issues, `$.outputs[${index}].status`, "output status must be satisfied, missing, or partial.");
            }
            if (typeof output.outputId === "string")
                outputsById.set(output.outputId, output);
        });
    }
    else {
        addIssue(issues, "$.outputs", "outputs must be an array.");
    }
    if (Array.isArray(value.evidence)) {
        value.evidence.forEach((evidence, index) => {
            if (!isRecord(evidence)) {
                addIssue(issues, `$.evidence[${index}]`, "evidence items must be objects.");
                return;
            }
            hasNonEmptyString(evidence, "evidenceId", `$.evidence[${index}]`, issues);
            hasNonEmptyString(evidence, "kind", `$.evidence[${index}]`, issues);
            hasNonEmptyString(evidence, "sourceRef", `$.evidence[${index}]`, issues);
            if ("sourceTimestamp" in evidence &&
                evidence.sourceTimestamp !== undefined &&
                typeof evidence.sourceTimestamp !== "string") {
                addIssue(issues, `$.evidence[${index}].sourceTimestamp`, "sourceTimestamp must be a string when present.");
            }
        });
    }
    else {
        addIssue(issues, "$.evidence", "evidence must be an array.");
    }
    if (Array.isArray(value.artifacts)) {
        value.artifacts.forEach((artifact, index) => {
            if (!isRecord(artifact)) {
                addIssue(issues, `$.artifacts[${index}]`, "artifacts items must be objects.");
                return;
            }
            hasNonEmptyString(artifact, "artifactId", `$.artifacts[${index}]`, issues);
            hasNonEmptyString(artifact, "kind", `$.artifacts[${index}]`, issues);
            if ("path" in artifact && artifact.path !== undefined && typeof artifact.path !== "string") {
                addIssue(issues, `$.artifacts[${index}].path`, "path must be a string when present.");
            }
        });
    }
    else {
        addIssue(issues, "$.artifacts", "artifacts must be an array.");
    }
    validateStringArray(value.risksOrGaps, "$.risksOrGaps", issues);
    if ("impossibleReason" in value && value.impossibleReason !== undefined) {
        if (!isRecord(value.impossibleReason)) {
            addIssue(issues, "$.impossibleReason", "impossibleReason must be an object when present.");
        }
        else {
            if (typeof value.impossibleReason.kind !== "string" ||
                !RESULT_REPORT_IMPOSSIBLE_REASON_KINDS.has(value.impossibleReason.kind)) {
                addIssue(issues, "$.impossibleReason.kind", "impossibleReason.kind must be physical, logical, or policy.");
            }
            hasNonEmptyString(value.impossibleReason, "reasonCode", "$.impossibleReason", issues);
            hasNonEmptyString(value.impossibleReason, "detail", "$.impossibleReason", issues);
        }
    }
    for (const [index, expected] of (options.expectedOutputs ?? []).entries()) {
        validateExpectedOutputContract(expected, `$.expectedOutputs[${index}]`, issues);
        if (!expected.required)
            continue;
        const output = outputsById.get(expected.outputId);
        if (!output || output.status === "missing") {
            addIssue(issues, "$.outputs", `Required output ${expected.outputId} is missing from ResultReport.`);
        }
        if (reportStatus !== "completed")
            continue;
        if (output && output.status !== "satisfied") {
            addIssue(issues, "$.outputs", `Required output ${expected.outputId} must be satisfied when ResultReport status is completed.`);
        }
        for (const evidenceKind of expected.acceptance.requiredEvidenceKinds) {
            const matchingEvidence = Array.isArray(value.evidence)
                ? value.evidence.filter((evidence) => isRecord(evidence) &&
                    evidence.kind === evidenceKind &&
                    typeof evidence.sourceRef === "string" &&
                    evidence.sourceRef.trim().length > 0)
                : [];
            if (matchingEvidence.length === 0) {
                addIssue(issues, "$.evidence", `Required evidence kind ${evidenceKind} with sourceRef is missing for ${expected.outputId}.`);
            }
        }
        if (expected.acceptance.artifactRequired) {
            const artifactReferences = Array.isArray(value.artifacts)
                ? value.artifacts.filter((artifact) => isRecord(artifact) &&
                    typeof artifact.path === "string" &&
                    artifact.path.trim().length > 0)
                : [];
            if (artifactReferences.length === 0) {
                addIssue(issues, "$.artifacts", `Required artifact reference is missing for ${expected.outputId}.`);
            }
        }
    }
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateFeedbackRequest(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "FeedbackRequest must be an object.",
                },
            ],
        };
    }
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "feedbackRequestId", "$", issues);
    hasNonEmptyString(value, "parentRunId", "$", issues);
    hasNonEmptyString(value, "subSessionId", "$", issues);
    validateStringArray(value.sourceResultReportIds, "$.sourceResultReportIds", issues, {
        requireNonEmptyItems: true,
    });
    if (Array.isArray(value.sourceResultReportIds) && value.sourceResultReportIds.length === 0) {
        addIssue(issues, "$.sourceResultReportIds", "sourceResultReportIds must include at least one result report id.");
    }
    validateStringArray(value.previousSubSessionIds, "$.previousSubSessionIds", issues, {
        requireNonEmptyItems: true,
    });
    if (Array.isArray(value.previousSubSessionIds) && value.previousSubSessionIds.length === 0) {
        addIssue(issues, "$.previousSubSessionIds", "previousSubSessionIds must include at least one sub-session id.");
    }
    if (typeof value.targetAgentPolicy !== "string" ||
        !FEEDBACK_TARGET_AGENT_POLICIES.has(value.targetAgentPolicy)) {
        addIssue(issues, "$.targetAgentPolicy", "targetAgentPolicy must be same_agent, alternative_direct_child, parent_decides, fallback_agent, lead_assigns, or knowbee_direct.");
    }
    if ("targetAgentId" in value &&
        value.targetAgentId !== undefined &&
        typeof value.targetAgentId !== "string") {
        addIssue(issues, "$.targetAgentId", "targetAgentId must be a string when present.");
    }
    if ("targetAgentName" in value && value.targetAgentName !== undefined) {
        hasNonEmptyAgentName(value, "targetAgentName", "$", issues);
    }
    if ("targetAgentNameSnapshot" in value &&
        value.targetAgentNameSnapshot !== undefined &&
        !(typeof value.targetAgentNameSnapshot === "string" && normalizeAgentName(value.targetAgentNameSnapshot))) {
        addIssue(issues, "$.targetAgentNameSnapshot", "targetAgentNameSnapshot must be a non-empty agent name.");
    }
    if (typeof value.targetAgentName === "string" &&
        typeof value.targetAgentNameSnapshot === "string" &&
        normalizeAgentNameSnapshot(value.targetAgentName) !== normalizeAgentNameSnapshot(value.targetAgentNameSnapshot)) {
        addIssue(issues, "$.targetAgentName", "targetAgentName must match targetAgentNameSnapshot when both are present.");
    }
    if ("requestingAgentName" in value && value.requestingAgentName !== undefined) {
        hasNonEmptyAgentName(value, "requestingAgentName", "$", issues);
    }
    if ("requestingAgentNameSnapshot" in value &&
        value.requestingAgentNameSnapshot !== undefined &&
        !(typeof value.requestingAgentNameSnapshot === "string" &&
            normalizeAgentName(value.requestingAgentNameSnapshot))) {
        addIssue(issues, "$.requestingAgentNameSnapshot", "requestingAgentNameSnapshot must be a non-empty agent name.");
    }
    if (typeof value.requestingAgentName === "string" &&
        typeof value.requestingAgentNameSnapshot === "string" &&
        normalizeAgentNameSnapshot(value.requestingAgentName) !==
            normalizeAgentNameSnapshot(value.requestingAgentNameSnapshot)) {
        addIssue(issues, "$.requestingAgentName", "requestingAgentName must match requestingAgentNameSnapshot when both are present.");
    }
    if ("synthesizedContextExchangeId" in value &&
        value.synthesizedContextExchangeId !== undefined &&
        typeof value.synthesizedContextExchangeId !== "string") {
        addIssue(issues, "$.synthesizedContextExchangeId", "synthesizedContextExchangeId must be a string when present.");
    }
    if (Array.isArray(value.carryForwardOutputs)) {
        value.carryForwardOutputs.forEach((output, index) => {
            if (!isRecord(output)) {
                addIssue(issues, `$.carryForwardOutputs[${index}]`, "carryForwardOutputs items must be objects.");
                return;
            }
            hasNonEmptyString(output, "outputId", `$.carryForwardOutputs[${index}]`, issues);
            if (output.status !== "satisfied" && output.status !== "partial") {
                addIssue(issues, `$.carryForwardOutputs[${index}].status`, "carryForward output status must be satisfied or partial.");
            }
        });
    }
    else {
        addIssue(issues, "$.carryForwardOutputs", "carryForwardOutputs must be an array.");
    }
    validateStringArray(value.missingItems, "$.missingItems", issues, { requireNonEmptyItems: true });
    validateStringArray(value.conflictItems, "$.conflictItems", issues);
    validateStringArray(value.requiredChanges, "$.requiredChanges", issues, {
        requireNonEmptyItems: true,
    });
    validateStringArray(value.additionalConstraints, "$.additionalConstraints", issues);
    validateStringArray(value.additionalContextRefs, "$.additionalContextRefs", issues);
    if (Array.isArray(value.expectedRevisionOutputs)) {
        value.expectedRevisionOutputs.forEach((output, index) => {
            validateExpectedOutputContract(output, `$.expectedRevisionOutputs[${index}]`, issues);
        });
    }
    else {
        addIssue(issues, "$.expectedRevisionOutputs", "expectedRevisionOutputs must be an array.");
    }
    hasNonEmptyString(value, "reasonCode", "$", issues);
    if ("createdAt" in value && value.createdAt !== undefined) {
        hasFiniteNumber(value, "createdAt", "$", issues, { min: 0 });
    }
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateAgentPromptBundle(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "AgentPromptBundle must be an object.",
                },
            ],
        };
    }
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "bundleId", "$", issues);
    hasNonEmptyString(value, "agentId", "$", issues);
    hasNonEmptyString(value, "role", "$", issues);
    hasNonEmptyString(value, "agentNameSnapshot", "$", issues);
    if ("agentName" in value && value.agentName !== undefined) {
        hasNonEmptyString(value, "agentName", "$", issues);
        if (typeof value.agentName === "string" &&
            typeof value.agentNameSnapshot === "string" &&
            normalizeAgentNameSnapshot(value.agentName) !== normalizeAgentNameSnapshot(value.agentNameSnapshot)) {
            addIssue(issues, "$.agentName", "agentName must match agentNameSnapshot.");
        }
    }
    if ("personalitySnapshot" in value && value.personalitySnapshot !== undefined) {
        hasNonEmptyString(value, "personalitySnapshot", "$", issues);
    }
    if ("promptLayerStack" in value && value.promptLayerStack !== undefined) {
        if (!Array.isArray(value.promptLayerStack)) {
            addIssue(issues, "$.promptLayerStack", "promptLayerStack must be an array when present.");
        }
    }
    validateMemoryPolicy(value.memoryPolicy, "$.memoryPolicy", issues);
    validateMemoryPolicyAgentOwnerScope(value.memoryPolicy, "$.memoryPolicy", expectedAgentOwnerScope(value), issues);
    validateCapabilityPolicy(value.capabilityPolicy, "$.capabilityPolicy", issues);
    validateStructuredTaskScope(value.taskScope, "$.taskScope", issues);
    validateStringArray(value.safetyRules, "$.safetyRules", issues, { requireNonEmptyItems: true });
    if (Array.isArray(value.sourceProvenance)) {
        value.sourceProvenance.forEach((source, index) => {
            if (!isRecord(source)) {
                addIssue(issues, `$.sourceProvenance[${index}]`, "sourceProvenance items must be objects.");
                return;
            }
            hasNonEmptyString(source, "sourceId", `$.sourceProvenance[${index}]`, issues);
            hasNonEmptyString(source, "version", `$.sourceProvenance[${index}]`, issues);
            if ("checksum" in source &&
                source.checksum !== undefined &&
                typeof source.checksum !== "string") {
                addIssue(issues, `$.sourceProvenance[${index}].checksum`, "checksum must be a string when present.");
            }
        });
    }
    else {
        addIssue(issues, "$.sourceProvenance", "sourceProvenance must be an array.");
    }
    if (Array.isArray(value.safetyRules) && value.safetyRules.length === 0) {
        addIssue(issues, "$.safetyRules", "safetyRules must include at least one safety boundary.");
    }
    if (Array.isArray(value.sourceProvenance) && value.sourceProvenance.length === 0) {
        addIssue(issues, "$.sourceProvenance", "sourceProvenance must include at least one prompt/profile source.");
    }
    if (typeof value.agentType !== "string" ||
        (value.agentType !== "knowbee" && value.agentType !== "sub_agent")) {
        addIssue(issues, "$.agentType", "agentType must be knowbee or sub_agent.");
    }
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateUserVisibleAgentMessage(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "UserVisibleAgentMessage must be an object.",
                },
            ],
        };
    }
    rejectUserFacingDisplayNameAliases(value, "$", issues);
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "messageId", "$", issues);
    hasNonEmptyString(value, "parentRunId", "$", issues);
    validateAgentAttributionSnapshot(value.speaker, "$.speaker", issues);
    hasNonEmptyString(value, "text", "$", issues);
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateNamedHandoffEvent(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "NamedHandoffEvent must be an object.",
                },
            ],
        };
    }
    rejectUserFacingDisplayNameAliases(value, "$", issues);
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "handoffId", "$", issues);
    hasNonEmptyString(value, "parentRunId", "$", issues);
    validateAgentAttributionSnapshot(value.sender, "$.sender", issues);
    validateAgentAttributionSnapshot(value.recipient, "$.recipient", issues);
    hasNonEmptyString(value, "purpose", "$", issues);
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateNamedDeliveryEvent(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [
                {
                    path: "$",
                    code: "contract_validation_failed",
                    message: "NamedDeliveryEvent must be an object.",
                },
            ],
        };
    }
    rejectUserFacingDisplayNameAliases(value, "$", issues);
    validateRuntimeIdentity(value.identity, "$.identity", issues);
    hasNonEmptyString(value, "deliveryId", "$", issues);
    hasNonEmptyString(value, "parentRunId", "$", issues);
    if (value.deliveryKind !== "data_exchange" &&
        value.deliveryKind !== "result_report" &&
        value.deliveryKind !== "handoff_context") {
        addIssue(issues, "$.deliveryKind", "deliveryKind must be data_exchange, result_report, or handoff_context.");
    }
    validateAgentAttributionSnapshot(value.sender, "$.sender", issues);
    validateAgentAttributionSnapshot(value.recipient, "$.recipient", issues);
    hasNonEmptyString(value, "summary", "$", issues);
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
//# sourceMappingURL=sub-agent-orchestration.js.map