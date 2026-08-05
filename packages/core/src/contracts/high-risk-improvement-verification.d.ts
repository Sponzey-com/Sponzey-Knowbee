export declare const HIGH_RISK_IMPROVEMENT_CHECKS: readonly ["permission_gate", "prompt_source_checksum", "rollback", "audit_log", "conflict", "harness_regression_suite"];
export type HighRiskImprovementCheck = typeof HIGH_RISK_IMPROVEMENT_CHECKS[number];
export type HighRiskImprovementKind = "prompt_source" | "harness";
export type HighRiskLogPurpose = "product" | "field_debug" | "development";
export interface HighRiskCheckReceipt {
    changeId: string;
    check: HighRiskImprovementCheck;
    status: "passed" | "failed";
    evidenceRef: string;
}
export interface HighRiskRollbackReceipt {
    changeId: string;
    sourceRef: string;
    baselineChecksum: string;
    changedChecksum: string;
    restoredChecksum: string;
    rollbackEvidenceRef: string;
}
export interface HighRiskLogBoundaryReceipt {
    changeId: string;
    purpose: HighRiskLogPurpose;
    visibility: "production_default" | "field_opt_in" | "development_only";
    containsInternalDiagnostics: boolean;
    containsUserSafeSummary: boolean;
    evidenceRef: string;
}
export type HighRiskVerificationDecision = {
    status: "authorized";
    changeId: string;
    risk: "high";
    checks: readonly HighRiskImprovementCheck[];
    rollbackSourceRef: string;
} | {
    status: "blocked";
    reasonCode: "check_receipt_invalid" | "check_scope_mismatch" | "check_missing" | "check_failed" | "rollback_receipt_invalid" | "rollback_scope_mismatch" | "rollback_checksum_invalid" | "log_receipt_invalid" | "log_scope_mismatch" | "log_purpose_missing" | "log_boundary_invalid";
    check?: HighRiskImprovementCheck;
    purpose?: HighRiskLogPurpose;
};
export declare function authorizeHighRiskImprovementVerification(input: {
    changeId: string;
    kind: HighRiskImprovementKind;
    checks: readonly HighRiskCheckReceipt[];
    rollback: HighRiskRollbackReceipt;
    logs: readonly HighRiskLogBoundaryReceipt[];
}): HighRiskVerificationDecision;
export declare function executeVerifiedHighRiskImprovement<T>(input: {
    decision: HighRiskVerificationDecision;
    apply: (authorization: Extract<HighRiskVerificationDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Extract<HighRiskVerificationDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=high-risk-improvement-verification.d.ts.map