import { validateYeonjangTargetSelector, } from "./yeonjang-target.js";
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function uniqueTrimmedStrings(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))];
}
function addIssue(issues, path, message) {
    issues.push({ path, code: "contract_validation_failed", message });
}
export function validateYeonjangBroadcastIntent(value) {
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [{ path: "$", code: "contract_validation_failed", message: "Broadcast intent must be an object." }],
        };
    }
    if (typeof value.confirm !== "boolean") {
        addIssue(issues, "$.confirm", "Broadcast intent requires confirm=true.");
    }
    else if (value.confirm !== true) {
        addIssue(issues, "$.confirm", "Broadcast intent confirm must be true.");
    }
    if (value.trustedOnly !== undefined && typeof value.trustedOnly !== "boolean") {
        addIssue(issues, "$.trustedOnly", "trustedOnly must be a boolean when provided.");
    }
    if (value.supportProfiles !== undefined && !Array.isArray(value.supportProfiles)) {
        addIssue(issues, "$.supportProfiles", "supportProfiles must be a string array when provided.");
    }
    if (value.requiredMethods !== undefined && !Array.isArray(value.requiredMethods)) {
        addIssue(issues, "$.requiredMethods", "requiredMethods must be a string array when provided.");
    }
    if (issues.length > 0)
        return { ok: false, issues };
    return {
        ok: true,
        value: normalizeYeonjangBroadcastIntent(value),
        issues: [],
    };
}
export function normalizeYeonjangBroadcastIntent(intent) {
    return {
        confirm: true,
        ...(intent.trustedOnly !== undefined ? { trustedOnly: intent.trustedOnly } : {}),
        ...(intent.supportProfiles?.length ? { supportProfiles: uniqueTrimmedStrings(intent.supportProfiles).sort() } : {}),
        ...(intent.requiredMethods?.length ? { requiredMethods: uniqueTrimmedStrings(intent.requiredMethods).sort() } : {}),
    };
}
export function buildYeonjangBroadcastIntentSchemaProperty() {
    return {
        type: "object",
        properties: {
            confirm: {
                type: "boolean",
                const: true,
                description: "명시적 broadcast intent 확인 값. fan-out 실행은 confirm=true일 때만 허용됩니다.",
            },
            trustedOnly: {
                type: "boolean",
                description: "기본값은 true이며 trusted 인스턴스만 실행 대상으로 유지합니다.",
            },
            supportProfiles: {
                type: "array",
                items: { type: "string" },
                description: "추가 support profile filter.",
            },
            requiredMethods: {
                type: "array",
                items: { type: "string" },
                description: "대상이 지원해야 하는 Yeonjang method 목록.",
            },
        },
        required: ["confirm"],
        additionalProperties: false,
    };
}
export function normalizeYeonjangBroadcastRetryReceipt(receipt) {
    const targetReceipts = Array.isArray(receipt.targetReceipts)
        ? receipt.targetReceipts
            .map((item) => ({
            instanceId: normalizeString(item?.instanceId),
            status: normalizeString(item?.status),
            ...(normalizeString(item?.sessionId) ? { sessionId: normalizeString(item?.sessionId) } : {}),
        }))
            .filter((item) => item.instanceId.length > 0
            && (item.status === "succeeded" || item.status === "failed" || item.status === "skipped"))
        : [];
    const skippedTargets = Array.isArray(receipt.skippedTargets)
        ? receipt.skippedTargets
            .map((item) => ({
            instanceId: normalizeString(item?.instanceId),
            ...(Array.isArray(item?.reasonCodes)
                ? { reasonCodes: uniqueTrimmedStrings(item.reasonCodes).sort() }
                : {}),
        }))
            .filter((item) => item.instanceId.length > 0)
        : [];
    return {
        ...(normalizeString(receipt.previousBroadcastRunId)
            ? { previousBroadcastRunId: normalizeString(receipt.previousBroadcastRunId) }
            : {}),
        retryMode: "failed_only",
        ...(targetReceipts.length > 0 ? { targetReceipts } : {}),
        ...(skippedTargets.length > 0 ? { skippedTargets } : {}),
    };
}
export function validateYeonjangBroadcastRetryReceipt(value) {
    if (value == null) {
        return { ok: true, value: { retryMode: "failed_only" }, issues: [] };
    }
    const issues = [];
    if (!isRecord(value)) {
        return {
            ok: false,
            issues: [{ path: "$", code: "contract_validation_failed", message: "Broadcast retry receipt must be an object." }],
        };
    }
    if (value.previousBroadcastRunId !== undefined && typeof value.previousBroadcastRunId !== "string") {
        addIssue(issues, "$.previousBroadcastRunId", "previousBroadcastRunId must be a string when provided.");
    }
    if (value.retryMode !== undefined && value.retryMode !== "failed_only") {
        addIssue(issues, "$.retryMode", "retryMode currently supports only failed_only.");
    }
    if (value.targetReceipts !== undefined && !Array.isArray(value.targetReceipts)) {
        addIssue(issues, "$.targetReceipts", "targetReceipts must be an array when provided.");
    }
    if (Array.isArray(value.targetReceipts)) {
        value.targetReceipts.forEach((item, index) => {
            if (!isRecord(item)) {
                addIssue(issues, `$.targetReceipts[${index}]`, "target receipt must be an object.");
                return;
            }
            if (!normalizeString(item.instanceId)) {
                addIssue(issues, `$.targetReceipts[${index}].instanceId`, "instanceId is required.");
            }
            const status = normalizeString(item.status);
            if (!["succeeded", "failed", "skipped"].includes(status)) {
                addIssue(issues, `$.targetReceipts[${index}].status`, "status must be succeeded, failed, or skipped.");
            }
        });
    }
    if (value.skippedTargets !== undefined && !Array.isArray(value.skippedTargets)) {
        addIssue(issues, "$.skippedTargets", "skippedTargets must be an array when provided.");
    }
    if (Array.isArray(value.skippedTargets)) {
        value.skippedTargets.forEach((item, index) => {
            if (!isRecord(item)) {
                addIssue(issues, `$.skippedTargets[${index}]`, "skipped target must be an object.");
                return;
            }
            if (!normalizeString(item.instanceId)) {
                addIssue(issues, `$.skippedTargets[${index}].instanceId`, "instanceId is required.");
            }
        });
    }
    if (issues.length > 0)
        return { ok: false, issues };
    return {
        ok: true,
        value: normalizeYeonjangBroadcastRetryReceipt(value),
        issues: [],
    };
}
export function buildYeonjangBroadcastRetryReceiptSchemaProperty() {
    return {
        type: "object",
        properties: {
            previousBroadcastRunId: {
                type: "string",
                description: "이전 broadcast run 식별자. retry trace용입니다.",
            },
            retryMode: {
                type: "string",
                enum: ["failed_only"],
                description: "현재는 이전 성공 대상을 제외하고 미완료 대상만 재시도합니다.",
            },
            targetReceipts: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        instanceId: { type: "string" },
                        status: { type: "string", enum: ["succeeded", "failed", "skipped"] },
                        sessionId: { type: "string" },
                    },
                    required: ["instanceId", "status"],
                    additionalProperties: false,
                },
            },
            skippedTargets: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        instanceId: { type: "string" },
                        reasonCodes: {
                            type: "array",
                            items: { type: "string" },
                        },
                    },
                    required: ["instanceId"],
                    additionalProperties: false,
                },
            },
        },
        additionalProperties: false,
    };
}
export function isYeonjangBroadcastSelector(selector) {
    return selector.type === "all_online" || selector.type === "filtered_group";
}
export function validateYeonjangBroadcastSelector(value) {
    const selectorValidation = validateYeonjangTargetSelector(value);
    if (!selectorValidation.ok) {
        return {
            ok: false,
            issues: selectorValidation.issues.map((issue) => ({
                path: issue.path,
                code: issue.code,
                message: issue.message,
            })),
        };
    }
    if (!isYeonjangBroadcastSelector(selectorValidation.value)) {
        return {
            ok: false,
            issues: [{
                    path: "$.type",
                    code: "contract_validation_failed",
                    message: "Broadcast run requires all_online or filtered_group selector.",
                }],
        };
    }
    return { ok: true, value: selectorValidation.value };
}
//# sourceMappingURL=yeonjang-broadcast.js.map