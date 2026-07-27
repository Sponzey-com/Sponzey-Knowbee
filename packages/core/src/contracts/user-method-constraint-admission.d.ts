export type UserMethodBoundary = "safety" | "privacy" | "permission" | "approval" | "legal";
export type UserMethodBoundaryDecision = "allowed" | "approval_required" | "denied";
export interface UserMethodBoundaryReview {
    receiptId: string;
    requestId: string;
    methodId: string;
    targetId: string;
    decisions: Record<UserMethodBoundary, UserMethodBoundaryDecision>;
    evidenceRefs: string[];
}
export interface UserMethodBoundaryInput {
    requestId: string;
    methodId: string;
    targetId: string;
    selectionReceiptId: string;
    review: UserMethodBoundaryReview;
}
export type UserMethodBoundaryAdmission = {
    status: "allowed";
    requestId: string;
    methodId: string;
    targetId: string;
    selectionReceiptId: string;
    boundaryReviewReceiptId: string;
} | {
    status: "approval_required";
    requestId: string;
    methodId: string;
    targetId: string;
    requiredBoundaries: UserMethodBoundary[];
} | {
    status: "denied";
    requestId: string;
    methodId: string;
    targetId: string;
    deniedBoundaries: UserMethodBoundary[];
} | {
    status: "rejected";
    reasonCodes: Array<"boundary_input_invalid" | "boundary_review_invalid" | "boundary_review_scope_mismatch">;
};
export interface ExclusiveMethodFailureReceipt {
    receiptId: string;
    requestId: string;
    methodId: string;
    targetId: string;
    verified: boolean;
    reason: string;
    evidenceRefs: string[];
}
export interface ExclusiveMethodAlternative {
    methodId: string;
    targetId: string;
    reason: string;
    evidenceRefs: string[];
}
export interface ExclusiveMethodSwitchApprovalReceipt {
    receiptId: string;
    requestId: string;
    fromMethodId: string;
    toMethodId: string;
    targetId: string;
    actorType: "user" | "system" | "administrator";
    actorId: string;
    decision: "approved" | "denied";
}
export interface ExclusiveMethodFallbackInput {
    requestId: string;
    targetId: string;
    exclusiveMethodIds: string[];
    failedMethodId: string;
    failure: ExclusiveMethodFailureReceipt;
    alternatives: ExclusiveMethodAlternative[];
    switchApproval?: ExclusiveMethodSwitchApprovalReceipt;
}
export type ExclusiveMethodFallbackRejectionCode = "exclusive_input_invalid" | "exclusive_failure_invalid" | "exclusive_failure_scope_mismatch" | "alternatives_invalid" | "alternatives_not_minimal" | "switch_approval_invalid" | "switch_approval_scope_mismatch" | "switch_approval_actor_invalid" | "switch_approval_denied";
export type ExclusiveMethodFallbackDecision = {
    status: "awaiting_user";
    requestId: string;
    failedMethodId: string;
    targetId: string;
    failureReason: string;
    failureEvidenceRefs: string[];
    alternatives: ExclusiveMethodAlternative[];
} | {
    status: "switch_authorized";
    requestId: string;
    fromMethodId: string;
    toMethodId: string;
    targetId: string;
    approvalReceiptId: string;
} | {
    status: "rejected";
    reasonCodes: ExclusiveMethodFallbackRejectionCode[];
};
export declare function admitUserMethodBoundaries(input: UserMethodBoundaryInput): UserMethodBoundaryAdmission;
export declare function decideExclusiveMethodFallback(input: ExclusiveMethodFallbackInput): ExclusiveMethodFallbackDecision;
//# sourceMappingURL=user-method-constraint-admission.d.ts.map