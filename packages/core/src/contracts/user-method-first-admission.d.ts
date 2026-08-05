export type UserMethodRisk = "safe" | "approval_required" | "denied";
export interface UserMethodBindingSnapshot {
    methodId: string;
    targetId: string;
    risk: UserMethodRisk;
}
export interface UserMethodSnapshotReceipt {
    receiptId: string;
    requestId: string;
    snapshotId: string;
    snapshotFingerprint: `sha256:${string}`;
}
export interface UserMethodFirstInput {
    requestId: string;
    targetId: string;
    preferredMethodIds: string[];
    approvedMethodIds: string[];
    capabilitySnapshot: {
        snapshotId: string;
        fingerprint: `sha256:${string}`;
        bindings: UserMethodBindingSnapshot[];
    };
    snapshotReceipt: UserMethodSnapshotReceipt;
}
export type UserMethodFirstRejectionCode = "user_method_input_invalid" | "capability_snapshot_receipt_mismatch" | "ambiguous_method_binding";
export type UserMethodFirstAdmission = {
    status: "selected" | "approval_required";
    requestId: string;
    methodId: string;
    targetId: string;
    preferenceIndex: number;
    snapshotReceiptId: string;
} | {
    status: "unavailable";
    requestId: string;
    targetId: string;
    reviewedMethodIds: string[];
} | {
    status: "rejected";
    reasonCodes: UserMethodFirstRejectionCode[];
};
export declare function selectFirstUserMethod(input: UserMethodFirstInput): UserMethodFirstAdmission;
//# sourceMappingURL=user-method-first-admission.d.ts.map