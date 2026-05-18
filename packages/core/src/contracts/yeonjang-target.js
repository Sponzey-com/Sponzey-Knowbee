const SELECTOR_TYPES = new Set([
    "local",
    "instance_id",
    "instance_alias",
    "call_name",
    "all_online",
    "filtered_group",
]);
const SELECTOR_LOCATIONS = new Set(["local", "remote"]);
const SELECTOR_STATES = new Set([
    "discovered",
    "online",
    "degraded",
    "offline",
    "update_required",
    "permission_required",
]);
const RESERVED_CALL_SELECTORS = new Set([
    "local",
    "remote",
    "all",
    "전체",
    "instance-id",
    "instance-alias",
    "call-name",
    "all-online",
    "filtered-group",
]);
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function normalizeCallName(value) {
    return value
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase("en-US")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function uniqueTrimmedStrings(values) {
    if (!Array.isArray(values))
        return [];
    return [...new Set(values.map((item) => normalizeString(item)).filter(Boolean))];
}
function addIssue(issues, path, message) {
    issues.push({ path, code: "contract_validation_failed", message });
}
function validateReservedCallName(value, path, issues) {
    const normalized = normalizeCallName(value);
    if (!normalized) {
        addIssue(issues, path, `Expected non-empty call name at ${path}.`);
        return;
    }
    if (RESERVED_CALL_SELECTORS.has(normalized)) {
        addIssue(issues, path, `Reserved selector keyword cannot be used at ${path}.`);
    }
}
export function isStructuredYeonjangTargetSelector(value) {
    return isRecord(value) && typeof value.type === "string" && SELECTOR_TYPES.has(value.type);
}
export function validateYeonjangTargetSelector(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [{ path: "$", code: "contract_validation_failed", message: "Yeonjang target selector must be an object." }],
        };
    }
    const type = normalizeString(value.type);
    if (!SELECTOR_TYPES.has(type)) {
        addIssue(issues, "$.type", "Unsupported Yeonjang target selector type.");
        return { ok: false, issues };
    }
    switch (type) {
        case "local":
        case "all_online":
            break;
        case "instance_id": {
            const instanceId = normalizeString(value.instanceId);
            if (!instanceId)
                addIssue(issues, "$.instanceId", "Expected non-empty instanceId.");
            break;
        }
        case "instance_alias": {
            const instanceAlias = normalizeString(value.instanceAlias);
            if (!instanceAlias)
                addIssue(issues, "$.instanceAlias", "Expected non-empty instanceAlias.");
            validateReservedCallName(instanceAlias, "$.instanceAlias", issues);
            break;
        }
        case "call_name": {
            const callName = normalizeString(value.callName);
            if (!callName)
                addIssue(issues, "$.callName", "Expected non-empty callName.");
            validateReservedCallName(callName, "$.callName", issues);
            break;
        }
        case "filtered_group": {
            const location = normalizeString(value.location);
            if (location && !SELECTOR_LOCATIONS.has(location)) {
                addIssue(issues, "$.location", "Unsupported filtered_group location.");
            }
            const supportProfiles = uniqueTrimmedStrings(value.supportProfiles);
            const platforms = uniqueTrimmedStrings(value.platforms);
            const rawStates = Array.isArray(value.states) ? value.states : [];
            const states = rawStates
                .map((item) => normalizeString(item))
                .filter((item) => SELECTOR_STATES.has(item));
            if (Array.isArray(value.states) && states.length !== rawStates.length) {
                addIssue(issues, "$.states", "Unsupported filtered_group state.");
            }
            if (!location && supportProfiles.length === 0 && platforms.length === 0 && states.length === 0) {
                addIssue(issues, "$", "filtered_group selector requires at least one filter.");
            }
            break;
        }
    }
    if (issues.length > 0)
        return { ok: false, issues };
    return { ok: true, value: normalizeYeonjangTargetSelector(value), issues: [] };
}
export function normalizeYeonjangTargetSelector(selector) {
    switch (selector.type) {
        case "local":
        case "all_online":
            return { type: selector.type };
        case "instance_id":
            return {
                type: "instance_id",
                instanceId: selector.instanceId.trim(),
            };
        case "instance_alias":
            return {
                type: "instance_alias",
                instanceAlias: selector.instanceAlias.trim(),
            };
        case "call_name":
            return {
                type: "call_name",
                callName: normalizeCallName(selector.callName),
            };
        case "filtered_group":
            return {
                type: "filtered_group",
                ...(selector.location ? { location: selector.location } : {}),
                ...(selector.supportProfiles?.length ? { supportProfiles: uniqueTrimmedStrings(selector.supportProfiles).sort() } : {}),
                ...(selector.platforms?.length ? { platforms: uniqueTrimmedStrings(selector.platforms).sort() } : {}),
                ...(selector.states?.length ? { states: [...new Set(selector.states)].sort() } : {}),
            };
    }
}
export function serializeYeonjangTargetSelector(selector) {
    const normalized = normalizeYeonjangTargetSelector(selector);
    switch (normalized.type) {
        case "local":
        case "all_online":
            return normalized.type;
        case "instance_id":
            return `instance-id:${normalized.instanceId}`;
        case "instance_alias":
            return `instance-alias:${normalizeCallName(normalized.instanceAlias)}`;
        case "call_name":
            return `call-name:${normalized.callName}`;
        case "filtered_group":
            return JSON.stringify(normalized);
    }
}
export function buildYeonjangTargetSelectorSchemaProperty() {
    return {
        anyOf: [
            {
                type: "object",
                properties: {
                    type: { type: "string", const: "local" },
                },
                required: ["type"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    type: { type: "string", const: "instance_id" },
                    instanceId: { type: "string" },
                },
                required: ["type", "instanceId"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    type: { type: "string", const: "instance_alias" },
                    instanceAlias: { type: "string" },
                },
                required: ["type", "instanceAlias"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    type: { type: "string", const: "call_name" },
                    callName: { type: "string" },
                },
                required: ["type", "callName"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    type: { type: "string", const: "all_online" },
                },
                required: ["type"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    type: { type: "string", const: "filtered_group" },
                    location: { type: "string", enum: ["local", "remote"] },
                    supportProfiles: {
                        type: "array",
                        items: { type: "string" },
                    },
                    platforms: {
                        type: "array",
                        items: { type: "string" },
                    },
                    states: {
                        type: "array",
                        items: {
                            type: "string",
                            enum: ["discovered", "online", "degraded", "offline", "update_required", "permission_required"],
                        },
                    },
                },
                required: ["type"],
                additionalProperties: false,
            },
        ],
        description: [
            "구조화된 Yeonjang target selector.",
            "단일 실행 도구에서는 local / instance_id / instance_alias / call_name만 바로 실행됩니다.",
            "all_online / filtered_group은 fan-out 작업용으로 예약되어 있으며 현재는 단일 실행에서 거부됩니다.",
        ].join(" "),
    };
}
//# sourceMappingURL=yeonjang-target.js.map