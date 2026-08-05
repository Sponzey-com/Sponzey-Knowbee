export declare const YEONJANG_SENSITIVE_EFFECTS: readonly ["file_write", "app_launch", "terminal_command", "screen_control", "keyboard_input", "mouse_input", "external_network"];
export type YeonjangSensitiveEffect = typeof YEONJANG_SENSITIVE_EFFECTS[number];
export type YeonjangPermissionDecision = "allow" | "deny" | "approval_required";
export interface YeonjangPermissionEntry {
    effect: YeonjangSensitiveEffect;
    decision: YeonjangPermissionDecision;
    reasonCode: string;
}
export interface YeonjangPermissionSnapshot {
    schemaVersion: 1;
    targetInstanceId: string;
    fingerprint: string;
    capturedAt: number;
    entries: YeonjangPermissionEntry[];
}
export interface YeonjangExplicitApprovalReceipt {
    schemaVersion: 1;
    approvalId: string;
    requestId: string;
    targetInstanceId: string;
    effect: YeonjangSensitiveEffect;
    actionFingerprint: string;
    permissionSnapshotFingerprint: string;
    decision: "allow_once" | "allow_run";
    status: "approved" | "consumed";
    approvedAt: number;
    expiresAt: number;
}
export type YeonjangSensitiveAuthorizationDecision = {
    status: "authorized";
    effect: YeonjangSensitiveEffect;
    authorization: "permission" | "explicit_approval";
    consumedApproval?: YeonjangExplicitApprovalReceipt;
} | {
    status: "blocked";
    effect: YeonjangSensitiveEffect;
    reasonCode: "permission_missing" | "permission_denied" | "permission_snapshot_stale" | "approval_missing" | "approval_scope_mismatch" | "approval_expired" | "approval_consumed";
};
export declare function authorizeYeonjangSensitiveOperation(input: {
    requestId: string;
    targetInstanceId: string;
    effect: YeonjangSensitiveEffect;
    actionFingerprint: string;
    permissionSnapshot: YeonjangPermissionSnapshot;
    approvalReceipt?: YeonjangExplicitApprovalReceipt;
    now: number;
    maxPermissionAgeMs: number;
}): YeonjangSensitiveAuthorizationDecision;
export declare function dispatchAuthorizedYeonjangSensitiveOperation<T>(input: {
    authorization: YeonjangSensitiveAuthorizationDecision;
    execute: () => Promise<T>;
}): Promise<{
    status: "executed";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=yeonjang-sensitive-operation-authorization.d.ts.map