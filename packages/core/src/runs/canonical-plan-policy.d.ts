export type CanonicalCapabilityRisk = "safe" | "approval_required" | "denied";
export interface CanonicalCapabilityBindingSnapshot {
    capabilityId: string;
    targetId: string;
    risk: CanonicalCapabilityRisk;
}
export interface CanonicalCapabilityExclusionSnapshot {
    capabilityId: string;
    targetId: string;
    reasonCodes: string[];
}
export interface CanonicalPlanPolicyInput {
    runId: string;
    workId: string;
    planFingerprint: `sha256:${string}`;
    capabilitySnapshot: {
        snapshotId: string;
        fingerprint: `sha256:${string}`;
        bindings: CanonicalCapabilityBindingSnapshot[];
        exclusions?: CanonicalCapabilityExclusionSnapshot[];
    };
    constraints: {
        requiredMethods: string[];
        requestedMethods: string[];
        exclusiveMethods: string[];
        targetId?: string | undefined;
        approvedCapabilityIds: string[];
    };
}
export type CanonicalPlanPolicyReasonCode = "plan_bindings_allowed" | "invalid_policy_input" | "exclusive_method_unavailable" | "required_method_unavailable" | "target_binding_unavailable" | "capability_approval_required" | "capability_denied";
export interface CanonicalPlanPolicyDecision {
    outcome: "allowed" | "approval_required" | "input_required" | "denied";
    reasonCode: CanonicalPlanPolicyReasonCode;
    evaluatedCapabilityIds: string[];
    capabilitySnapshotId: string;
}
export interface CanonicalPlanPolicyReceiptDescriptor {
    runId: string;
    workId: string;
    receiptId: string;
    kind: "policy";
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
}
export declare function evaluateCanonicalPlanPolicy(input: CanonicalPlanPolicyInput): CanonicalPlanPolicyDecision;
export declare function buildCanonicalPlanPolicyReceiptDescriptor(input: {
    input: CanonicalPlanPolicyInput;
    decision: CanonicalPlanPolicyDecision;
}): CanonicalPlanPolicyReceiptDescriptor;
//# sourceMappingURL=canonical-plan-policy.d.ts.map