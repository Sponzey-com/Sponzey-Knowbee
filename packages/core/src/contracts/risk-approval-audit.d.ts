export type PromptChangeRisk = "low" | "medium" | "high";
export type ApprovalResponseOutcome = "approved" | "denied" | "timeout" | "ambiguous";
export interface RiskApprovalRequestReceipt {
    requestId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    risk: PromptChangeRisk;
    state: "pending";
    requestedBy: string;
    requestedAt: number;
    expiresAt: number;
}
export interface RiskApprovalResponseReceipt {
    requestId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    outcome: ApprovalResponseOutcome;
    actorId: string;
    respondedAt: number;
}
export interface ApprovalAuditReceipt {
    correlationId: string;
    requestId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    risk: PromptChangeRisk;
    decision: "approved";
    actorId: string;
    recordedAt: number;
}
export type RiskApprovalDecision = {
    status: "not_required";
    risk: "low";
} | {
    status: "authorized";
    requestId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    risk: "medium" | "high";
    auditCorrelationId: string;
} | {
    status: "blocked";
    reasonCode: "approval_request_missing" | "approval_request_invalid" | "approval_request_expired" | "approval_response_missing" | "approval_response_scope_mismatch" | "approval_denied" | "approval_timeout" | "approval_ambiguous" | "approval_audit_missing" | "approval_audit_invalid" | "approval_audit_scope_mismatch" | "approval_audit_duplicate";
};
export declare function authorizeRiskBasedPromptChange(input: {
    risk: PromptChangeRisk;
    expectedProposalFingerprint: string;
    expectedSourceSetFingerprint: string;
    request?: RiskApprovalRequestReceipt;
    response?: RiskApprovalResponseReceipt;
    audit?: ApprovalAuditReceipt;
    existingAuditCorrelationIds?: readonly string[];
    now: number;
}): RiskApprovalDecision;
export declare function applyRiskApprovedPromptChange<T>(input: {
    decision: RiskApprovalDecision;
    apply: (authorization: Extract<RiskApprovalDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Exclude<RiskApprovalDecision, {
    status: "authorized";
}>>;
//# sourceMappingURL=risk-approval-audit.d.ts.map