import { isYeonjangLiveSmokeReadOnlyMethod, } from "../runs/yeonjang-live-smoke.js";
const TOP_LEVEL_KEYS = [
    "authorization",
    "candidate",
    "kind",
    "requestedKeyId",
    "schemaVersion",
    "selection",
];
const CANDIDATE_KEYS = ["appVersion", "gitCommit", "gitTag"];
const AUTHORIZATION_KEYS = ["approvedAt", "auditEventId", "authorizationId", "expiresAt"];
const SELECTION_KEYS = ["extensions", "yeonjang"];
const EXTENSION_KEYS = [
    "agentId",
    "bindingId",
    "capability",
    "catalogId",
    "params",
    "readOnly",
    "toolName",
];
const YEONJANG_KEYS = ["instanceId", "method", "readOnly", "sessionId"];
const YEONJANG_KEYS_WITH_PARAMS = ["instanceId", "method", "params", "readOnly", "sessionId"];
const KEY_ID = /^sha256:[a-f0-9]{64}$/u;
const MAX_SELECTION_JSON_BYTES = 8_192;
const MAX_SELECTION_JSON_DEPTH = 4;
const MAX_SELECTION_JSON_NODES = 64;
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function exact(value, max = 256) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function validJsonValue(value, depth, counter) {
    counter.count += 1;
    if (counter.count > MAX_SELECTION_JSON_NODES || depth > MAX_SELECTION_JSON_DEPTH)
        return false;
    if (value === null || typeof value === "boolean")
        return true;
    if (typeof value === "string")
        return value.length <= 512;
    if (typeof value === "number")
        return Number.isFinite(value);
    if (Array.isArray(value)) {
        return value.length <= 16 && value.every((item) => validJsonValue(item, depth + 1, counter));
    }
    if (!isRecord(value))
        return false;
    const keys = Object.keys(value);
    return (keys.length <= 16 &&
        keys.every((key) => key.length > 0 &&
            key.length <= 64 &&
            key !== "__proto__" &&
            key !== "constructor" &&
            key !== "prototype" &&
            validJsonValue(value[key], depth + 1, counter)));
}
function freezeJsonValue(value) {
    if (Array.isArray(value)) {
        return Object.freeze(value.map((item) => freezeJsonValue(item)));
    }
    if (value && typeof value === "object") {
        return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            freezeJsonValue(item),
        ])));
    }
    return value;
}
function validateSelection(value) {
    if (!isRecord(value) || !exactKeys(value, SELECTION_KEYS))
        return null;
    if (!Array.isArray(value.extensions) || value.extensions.length !== 2)
        return null;
    const extensions = [];
    for (const item of value.extensions) {
        if (!isRecord(item) ||
            !exactKeys(item, EXTENSION_KEYS) ||
            (item.capability !== "skill" && item.capability !== "mcp") ||
            !exact(item.agentId) ||
            !exact(item.bindingId) ||
            !exact(item.catalogId) ||
            !exact(item.toolName) ||
            item.readOnly !== true ||
            !isRecord(item.params)) {
            return null;
        }
        let paramsBytes = Number.POSITIVE_INFINITY;
        try {
            paramsBytes = new TextEncoder().encode(JSON.stringify(item.params)).byteLength;
        }
        catch {
            return null;
        }
        if (paramsBytes > MAX_SELECTION_JSON_BYTES || !validJsonValue(item.params, 0, { count: 0 })) {
            return null;
        }
        extensions.push(Object.freeze({
            capability: item.capability,
            agentId: item.agentId,
            bindingId: item.bindingId,
            catalogId: item.catalogId,
            toolName: item.toolName,
            readOnly: true,
            params: freezeJsonValue(item.params),
        }));
    }
    if (new Set(extensions.map((item) => item.capability)).size !== 2 ||
        !extensions.some((item) => item.capability === "skill") ||
        !extensions.some((item) => item.capability === "mcp") ||
        new Set(extensions.map((item) => item.bindingId)).size !== 2 ||
        new Set(extensions.map((item) => item.catalogId)).size !== 2 ||
        new Set(extensions.map((item) => item.toolName)).size !== 2) {
        return null;
    }
    const yeonjang = value.yeonjang;
    if (!isRecord(yeonjang) ||
        (!exactKeys(yeonjang, YEONJANG_KEYS) && !exactKeys(yeonjang, YEONJANG_KEYS_WITH_PARAMS)) ||
        !exact(yeonjang.instanceId) ||
        !exact(yeonjang.sessionId) ||
        !isYeonjangLiveSmokeReadOnlyMethod(yeonjang.method) ||
        yeonjang.readOnly !== true) {
        return null;
    }
    let yeonjangParams;
    if ("params" in yeonjang) {
        if (!isRecord(yeonjang.params))
            return null;
        let paramsBytes = Number.POSITIVE_INFINITY;
        try {
            paramsBytes = new TextEncoder().encode(JSON.stringify(yeonjang.params)).byteLength;
        }
        catch {
            return null;
        }
        if (paramsBytes > MAX_SELECTION_JSON_BYTES ||
            !validJsonValue(yeonjang.params, 0, { count: 0 })) {
            return null;
        }
        yeonjangParams = freezeJsonValue(yeonjang.params);
    }
    const resolvedYeonjang = {
        instanceId: yeonjang.instanceId,
        sessionId: yeonjang.sessionId,
        method: yeonjang.method,
        ...(yeonjangParams ? { params: yeonjangParams } : {}),
        readOnly: true,
    };
    return Object.freeze({
        extensions: Object.freeze(extensions),
        yeonjang: Object.freeze(resolvedYeonjang),
    });
}
export function validateLiveAcceptanceExecutionRequest(value, now) {
    if (!isRecord(value) || !exactKeys(value, TOP_LEVEL_KEYS)) {
        return { status: "rejected", reasonCode: "live_acceptance_request_shape_invalid" };
    }
    if (value.kind !== "knowbee.release.live_acceptance_execution_request" ||
        value.schemaVersion !== 2) {
        return { status: "rejected", reasonCode: "live_acceptance_request_schema_invalid" };
    }
    const candidate = value.candidate;
    if (!isRecord(candidate) ||
        !exactKeys(candidate, CANDIDATE_KEYS) ||
        !exact(candidate.appVersion, 128) ||
        (candidate.gitTag !== null && !exact(candidate.gitTag, 256)) ||
        (candidate.gitCommit !== null && !exact(candidate.gitCommit, 256))) {
        return { status: "rejected", reasonCode: "live_acceptance_request_candidate_invalid" };
    }
    const authorization = value.authorization;
    const approvedAt = isRecord(authorization) ? authorization.approvedAt : undefined;
    const expiresAt = isRecord(authorization) ? authorization.expiresAt : undefined;
    if (!isRecord(authorization) ||
        !exactKeys(authorization, AUTHORIZATION_KEYS) ||
        !exact(authorization.authorizationId) ||
        !exact(authorization.auditEventId) ||
        typeof approvedAt !== "number" ||
        typeof expiresAt !== "number" ||
        !Number.isSafeInteger(approvedAt) ||
        !Number.isSafeInteger(expiresAt) ||
        approvedAt > now ||
        approvedAt >= expiresAt) {
        return { status: "rejected", reasonCode: "live_acceptance_request_authorization_invalid" };
    }
    if (expiresAt <= now) {
        return { status: "rejected", reasonCode: "live_acceptance_request_authorization_expired" };
    }
    if (!KEY_ID.test(String(value.requestedKeyId))) {
        return { status: "rejected", reasonCode: "live_acceptance_request_key_invalid" };
    }
    const selection = validateSelection(value.selection);
    if (!selection) {
        return { status: "rejected", reasonCode: "live_acceptance_request_selection_invalid" };
    }
    return {
        status: "verified",
        request: Object.freeze({
            kind: "knowbee.release.live_acceptance_execution_request",
            schemaVersion: 2,
            candidate: Object.freeze({
                appVersion: candidate.appVersion,
                gitTag: candidate.gitTag,
                gitCommit: candidate.gitCommit,
            }),
            authorization: Object.freeze({
                authorizationId: authorization.authorizationId,
                auditEventId: authorization.auditEventId,
                approvedAt,
                expiresAt,
            }),
            selection,
            requestedKeyId: value.requestedKeyId,
        }),
    };
}
//# sourceMappingURL=live-acceptance-execution-request.js.map