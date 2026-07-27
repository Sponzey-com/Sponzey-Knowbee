export interface SideEffectDescriptor {
    effectId: string;
    kind: "file_change" | "external_transfer" | "payment" | "deletion" | "application_control";
    target: string;
    scope: string[];
    risk: "low" | "high";
    plannerActorId: string;
    executorActorId: string;
}
export interface SideEffectPolicyReceipt {
    receiptId: string;
    effectId: string;
    target: string;
    scope: string[];
    decision: "allowed" | "approval_required" | "denied";
    issuedAt: number;
    expiresAt: number;
}
export interface SideEffectApprovalReceipt {
    receiptId: string;
    effectId: string;
    target: string;
    scope: string[];
    approverActorId: string;
    status: "approved" | "denied";
    issuedAt: number;
}
export interface SideEffectAuthorizationInput {
    now: number;
    workId: string;
    effect: SideEffectDescriptor;
    policyReceipt: SideEffectPolicyReceipt;
    approvalReceipt?: SideEffectApprovalReceipt;
}
export type SideEffectAuthorizationRejectionCode = "effect_authorization_invalid" | "effect_policy_scope_mismatch" | "effect_policy_denied" | "effect_policy_stale" | "effect_approval_missing" | "effect_approval_scope_mismatch" | "effect_approval_invalid" | "effect_self_approval_forbidden";
export type SideEffectAuthorization = {
    status: "authorized";
    workId: string;
    effectId: string;
    policyReceiptId: string;
    approvalReceiptId?: string;
} | {
    status: "rejected";
    reasonCodes: SideEffectAuthorizationRejectionCode[];
};
export interface EvidenceSourceComparisonFact {
    sourceRef: string;
    claimFingerprint: string;
    observedAt: number;
    reliability: "low" | "medium" | "high";
    directness: "indirect" | "direct";
}
export interface HighRiskVerification {
    kind: "independent_review" | "deterministic_postcondition";
    verifierActorId?: string;
    evidenceRefs: string[];
    passed: boolean;
}
export interface EvidenceComparisonDecision {
    sourceRefs: string[];
    outcome: "resolved" | "unresolved";
    selectedSourceRef: string | null;
    uncertainty: string | null;
    reason: string;
}
export interface HighRiskEvidenceReviewInput {
    workId: string;
    effect: SideEffectDescriptor;
    verification: HighRiskVerification;
    sources: EvidenceSourceComparisonFact[];
    comparison: EvidenceComparisonDecision;
}
export type HighRiskEvidenceReviewRejectionCode = "high_risk_review_invalid" | "high_risk_verification_failed" | "high_risk_self_verification_forbidden" | "evidence_source_set_mismatch" | "conflicting_evidence_not_resolved" | "unresolved_uncertainty_missing";
export type HighRiskEvidenceReview = {
    status: "verified";
    workId: string;
    selectedSourceRef: string;
    evidenceRefs: string[];
} | {
    status: "uncertain";
    workId: string;
    sourceRefs: string[];
    uncertainty: string;
} | {
    status: "rejected";
    reasonCodes: HighRiskEvidenceReviewRejectionCode[];
};
export declare function authorizeSideEffect(input: SideEffectAuthorizationInput): SideEffectAuthorization;
export declare function reviewHighRiskEvidence(input: HighRiskEvidenceReviewInput): HighRiskEvidenceReview;
//# sourceMappingURL=side-effect-evidence-gate.d.ts.map