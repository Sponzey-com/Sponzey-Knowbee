import type { NextRunPromptActivationDecision } from "./platform-prompt-activation-boundary.js";
export declare const HIGH_RISK_PERMISSION_CAPABILITIES: readonly ["tool", "mcp", "filesystem", "network", "yeonjang"];
export type HighRiskPermissionCapability = typeof HIGH_RISK_PERMISSION_CAPABILITIES[number];
export interface HighRiskPermissionGateReceipt {
    changeId: string;
    capability: HighRiskPermissionCapability;
    testPassed: boolean;
    policyPreserved: boolean;
    approvalRequired: boolean;
    approvalSatisfied: boolean;
    policyFingerprint: string;
    evidenceRef: string;
}
export interface PromptSourceChecksumReceipt {
    changeId: string;
    sourceRef: string;
    sourceSetFingerprint: string;
    baselineChecksum: string;
    proposedChecksum: string;
    evidenceRef: string;
}
export type HighRiskSourceEvidenceDecision = {
    status: "verified";
    changeId: string;
    sourceSetFingerprint: string;
    permissionCapabilities: readonly HighRiskPermissionCapability[];
    sourceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "permission_receipt_invalid" | "permission_scope_mismatch" | "permission_missing" | "permission_test_failed" | "permission_policy_weakened" | "permission_approval_unsatisfied" | "checksum_receipt_invalid" | "checksum_scope_mismatch" | "checksum_source_missing" | "checksum_source_unexpected" | "checksum_unchanged" | "checksum_fingerprint_mismatch";
    capability?: HighRiskPermissionCapability;
    sourceRef?: string;
};
export type PromptActivationProjection = {
    status: "active";
    activationRunId: string;
    runtimeSnapshotFingerprint: string;
    method: "reload" | "restart" | "next_request_snapshot";
} | {
    status: "pending";
    reasonCode: Extract<NextRunPromptActivationDecision, {
        status: "blocked";
    }>["reasonCode"];
};
export declare function verifyHighRiskSourceEvidence(input: {
    changeId: string;
    expectedSourceRefs: readonly string[];
    expectedSourceSetFingerprint: string;
    permissions: readonly HighRiskPermissionGateReceipt[];
    checksums: readonly PromptSourceChecksumReceipt[];
}): HighRiskSourceEvidenceDecision;
export declare function projectPromptActivation(decision: NextRunPromptActivationDecision): PromptActivationProjection;
export declare function publishConfirmedPromptActivation<T>(input: {
    projection: PromptActivationProjection;
    publish: (active: Extract<PromptActivationProjection, {
        status: "active";
    }>) => Promise<T>;
}): Promise<{
    status: "published";
    result: T;
} | Extract<PromptActivationProjection, {
    status: "pending";
}>>;
//# sourceMappingURL=high-risk-source-activation-evidence.d.ts.map