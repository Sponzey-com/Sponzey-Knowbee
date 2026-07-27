export declare const APPROVAL_SOURCE_KINDS: readonly ["prompt_source_file", "persistent_prompt_record", "harness_source_file"];
export type ApprovalSourceKind = typeof APPROVAL_SOURCE_KINDS[number];
export interface ApprovalSourceDescriptor {
    sourceKind: ApprovalSourceKind;
    sourceRef: string;
    baselineVersion: string;
    baselineChecksum: string;
    proposedChecksum: string;
}
export interface ExactSourceApprovalRequest {
    approvalId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    targetSources: ApprovalSourceDescriptor[];
    changeSummary: string;
    riskLevel: "low" | "medium" | "high";
    invariantsAffected: string[];
    testsToRun: string[];
    rollbackPlan: string;
    activationMethod: "reload" | "restart" | "registry_activation" | "next_request_snapshot";
    decision: "approved" | "denied";
    approvedBy: string;
    issuedAt: number;
    expiresAt: number;
}
export type ExactSourceApprovalDecision = {
    status: "authorized";
    approvalId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    targetSources: ApprovalSourceDescriptor[];
} | {
    status: "blocked";
    reasonCode: "approval_request_invalid" | "approval_denied" | "approval_expired" | "source_descriptor_invalid" | "source_ref_not_exact" | "source_duplicate" | "proposal_scope_mismatch" | "source_set_fingerprint_mismatch" | "source_set_mismatch";
};
export declare function authorizeExactSourceApproval(input: {
    request: ExactSourceApprovalRequest;
    expectedProposalFingerprint: string;
    expectedSourceSetFingerprint: string;
    proposalSources: readonly ApprovalSourceDescriptor[];
    now: number;
}): ExactSourceApprovalDecision;
export declare function applyExactApprovedSource<T>(input: {
    decision: ExactSourceApprovalDecision;
    source: ApprovalSourceDescriptor;
    apply: (source: ApprovalSourceDescriptor) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=exact-source-approval.d.ts.map