import type { StructuredFailureRecoveryDecision } from "./failure-recovery-decision.js";
export type RecoveryAlternativeImpact = "user_intent" | "safety_boundary" | "permission_scope";
export type RecoveryAlternativeConfirmationAuthority = "user" | "safety_policy_owner" | "permission_owner";
export interface LlmRecoveryAlternativeImpactAssessment {
    receiptId: string;
    workId: string;
    recoveryReceiptId: string;
    nextAttemptSignature: string;
    impacts: RecoveryAlternativeImpact[];
    reason: string;
}
export interface RecoveryAlternativeConfirmationReceipt {
    receiptId: string;
    workId: string;
    recoveryReceiptId: string;
    nextAttemptSignature: string;
    impact: RecoveryAlternativeImpact;
    authority: RecoveryAlternativeConfirmationAuthority;
    decision: "approved" | "denied";
    issuedAt: number;
    expiresAt: number;
}
export interface RecoveryAlternativeConfirmationInput {
    now: number;
    workId: string;
    recoveryDecision: StructuredFailureRecoveryDecision;
    impactAssessment: LlmRecoveryAlternativeImpactAssessment;
    confirmations: RecoveryAlternativeConfirmationReceipt[];
}
export type RecoveryAlternativeConfirmationRejectionCode = "recovery_decision_not_ready" | "alternative_method_not_changed" | "impact_assessment_invalid" | "impact_assessment_scope_mismatch" | "confirmation_invalid" | "confirmation_scope_mismatch" | "confirmation_authority_mismatch" | "confirmation_denied" | "confirmation_stale";
export type RecoveryAlternativeConfirmationAdmission = {
    status: "allowed";
    workId: string;
    recoveryReceiptId: string;
    impactAssessmentReceiptId: string;
    confirmationReceiptIds: string[];
    nextAttemptSignature: string;
} | {
    status: "confirmation_required";
    workId: string;
    recoveryReceiptId: string;
    required: Array<{
        impact: RecoveryAlternativeImpact;
        authority: RecoveryAlternativeConfirmationAuthority;
    }>;
} | {
    status: "rejected";
    reasonCodes: RecoveryAlternativeConfirmationRejectionCode[];
};
export declare function admitRecoveryAlternativeConfirmation(input: RecoveryAlternativeConfirmationInput): RecoveryAlternativeConfirmationAdmission;
//# sourceMappingURL=recovery-alternative-confirmation.d.ts.map