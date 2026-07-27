export const YEONJANG_SENSITIVE_EFFECTS = [
    "file_write",
    "app_launch",
    "terminal_command",
    "screen_control",
    "keyboard_input",
    "mouse_input",
    "external_network",
];
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function validTime(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer.`);
    return value;
}
function validateSnapshot(input) {
    if (input.snapshot.schemaVersion !== 1)
        throw new Error("Unsupported Yeonjang permission snapshot schema version.");
    if (!Number.isSafeInteger(input.maxAgeMs) || input.maxAgeMs < 0)
        throw new Error("maxAgeMs must be a non-negative integer.");
    const now = validTime(input.now, "Current time");
    const capturedAt = validTime(input.snapshot.capturedAt, "Permission snapshot capturedAt");
    if (capturedAt > now || now - capturedAt > input.maxAgeMs)
        return "stale";
    if (required(input.snapshot.targetInstanceId, "Permission target instance ID") !== required(input.targetInstanceId, "Target instance ID")) {
        throw new Error("Permission snapshot target does not match the exact Yeonjang target.");
    }
    required(input.snapshot.fingerprint, "Permission snapshot fingerprint");
    const entries = new Map();
    for (const entry of input.snapshot.entries) {
        if (!YEONJANG_SENSITIVE_EFFECTS.includes(entry.effect))
            throw new Error(`Unsupported Yeonjang sensitive effect: ${entry.effect}.`);
        if (entries.has(entry.effect))
            throw new Error(`Permission effect entries must be unique: ${entry.effect}.`);
        required(entry.reasonCode, "Permission reason code");
        entries.set(entry.effect, { ...entry });
    }
    return entries;
}
export function authorizeYeonjangSensitiveOperation(input) {
    const requestId = required(input.requestId, "Request ID");
    const targetInstanceId = required(input.targetInstanceId, "Target instance ID");
    const actionFingerprint = required(input.actionFingerprint, "Action fingerprint");
    const entries = validateSnapshot({
        snapshot: input.permissionSnapshot,
        targetInstanceId,
        now: input.now,
        maxAgeMs: input.maxPermissionAgeMs,
    });
    if (entries === "stale")
        return { status: "blocked", effect: input.effect, reasonCode: "permission_snapshot_stale" };
    const permission = entries.get(input.effect);
    if (!permission)
        return { status: "blocked", effect: input.effect, reasonCode: "permission_missing" };
    if (permission.decision === "deny")
        return { status: "blocked", effect: input.effect, reasonCode: "permission_denied" };
    if (permission.decision === "allow")
        return { status: "authorized", effect: input.effect, authorization: "permission" };
    const receipt = input.approvalReceipt;
    if (!receipt)
        return { status: "blocked", effect: input.effect, reasonCode: "approval_missing" };
    if (receipt.schemaVersion !== 1)
        throw new Error("Unsupported Yeonjang approval receipt schema version.");
    validTime(receipt.approvedAt, "Approval time");
    validTime(receipt.expiresAt, "Approval expiry");
    required(receipt.approvalId, "Approval ID");
    if (receipt.status === "consumed")
        return { status: "blocked", effect: input.effect, reasonCode: "approval_consumed" };
    if (receipt.expiresAt <= input.now || receipt.approvedAt > input.now) {
        return { status: "blocked", effect: input.effect, reasonCode: "approval_expired" };
    }
    if (receipt.requestId !== requestId
        || receipt.targetInstanceId !== targetInstanceId
        || receipt.effect !== input.effect
        || receipt.actionFingerprint !== actionFingerprint
        || receipt.permissionSnapshotFingerprint !== input.permissionSnapshot.fingerprint) {
        return { status: "blocked", effect: input.effect, reasonCode: "approval_scope_mismatch" };
    }
    return {
        status: "authorized",
        effect: input.effect,
        authorization: "explicit_approval",
        ...(receipt.decision === "allow_once" ? { consumedApproval: { ...receipt, status: "consumed" } } : {}),
    };
}
export async function dispatchAuthorizedYeonjangSensitiveOperation(input) {
    if (input.authorization.status !== "authorized") {
        return { status: "blocked", reasonCode: input.authorization.reasonCode };
    }
    return { status: "executed", result: await input.execute() };
}
//# sourceMappingURL=yeonjang-sensitive-operation-authorization.js.map