export interface ChildResultTrustBinding {
    parentRunId: string;
    parentAgentId: string;
    childAgentId: string;
    childAgentNameSnapshot: string;
    subSessionId: string;
    resultReportId: string;
    resultFingerprint: `sha256:${string}`;
}
export interface ChildResultTrustReceipt {
    readonly schemaVersion: "child-result-trust-v1";
    readonly parentRunId: string;
    readonly parentAgentId: string;
    readonly childAgentId: string;
    readonly subSessionId: string;
    readonly resultReportId: string;
    readonly resultFingerprint: `sha256:${string}`;
    readonly bindingFingerprint: `sha256:${string}`;
    readonly sourceRef: string;
    readonly trustClass: "untrusted_external";
    readonly instructionIsolation: "data_only";
    readonly redactionState: "redacted";
}
export type ChildResultTrustReasonCode = "child_result_not_direct_child" | "child_result_binding_invalid" | "child_result_receipt_binding_mismatch" | "child_result_receipt_isolation_invalid";
export declare function issueChildResultTrustReceipt(input: ChildResultTrustBinding & {
    directChildAgentIds: readonly string[];
}): {
    ok: true;
    receipt: Readonly<ChildResultTrustReceipt>;
} | {
    ok: false;
    reasonCode: ChildResultTrustReasonCode;
};
export declare function validateChildResultTrustReceipt(input: {
    receipt: Readonly<ChildResultTrustReceipt>;
    expected: ChildResultTrustBinding;
    directChildAgentIds: readonly string[];
}): {
    allowed: boolean;
    reasonCode: ChildResultTrustReasonCode | "child_result_data_only";
    sourceRef: string;
};
export declare function projectChildResultForParent(input: {
    receipt: Readonly<ChildResultTrustReceipt>;
    content: string;
}): Readonly<{
    role: "external_data";
    policyAuthority: "none";
    sourceRef: string;
    instructionIsolation: "data_only";
    content: string;
}>;
//# sourceMappingURL=child-result-trust.d.ts.map