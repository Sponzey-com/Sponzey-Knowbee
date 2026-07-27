export declare const HARNESS_APPROVAL_SCOPES: readonly ["entry", "draft_review", "apply", "activation"];
export type HarnessApprovalScope = typeof HARNESS_APPROVAL_SCOPES[number];
export interface HarnessImprovementEntryReceipt {
    requestId: string;
    requesterId: string;
    requesterType: "user" | "administrator" | "agent";
    explicitRequest: boolean;
    classifiedBy: "llm";
    classification: "explicit_harness_improvement" | "ambiguous" | "casual_chat" | "ordinary_task";
    diagnosedAction: "enter_harness_improvement" | "ask_clarification" | "ordinary_request";
    targetHarnessSourceRefs: string[];
    diagnosedAt: number;
    expiresAt: number;
}
export type HarnessEntryDecision = {
    status: "authorized";
    scope: "entry";
    requestId: string;
    targetHarnessSourceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "entry_receipt_invalid" | "explicit_request_required" | "requester_not_authorized" | "llm_diagnosis_required" | "entry_target_required" | "entry_receipt_expired";
};
export interface HarnessScopedApprovalReceipt {
    approvalId: string;
    scope: HarnessApprovalScope;
    decision: "approved" | "denied";
    approvedBy: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    appliedChecksum?: string;
    runtimeTargetFingerprint?: string;
    issuedAt: number;
    expiresAt: number;
}
export type HarnessScopedApprovalDecision = {
    status: "authorized";
    scope: HarnessApprovalScope;
    approvalId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    appliedChecksum?: string;
    runtimeTargetFingerprint?: string;
} | {
    status: "blocked";
    reasonCode: "approval_receipt_invalid" | "approval_denied" | "approval_expired" | "approval_scope_mismatch" | "approval_proposal_mismatch" | "approval_source_scope_mismatch" | "activation_lineage_missing" | "activation_lineage_mismatch";
};
export declare function authorizeHarnessImprovementEntry(input: {
    receipt: HarnessImprovementEntryReceipt;
    now: number;
}): HarnessEntryDecision;
export declare function authorizeHarnessApprovalScope(input: {
    requiredScope: HarnessApprovalScope;
    receipt: HarnessScopedApprovalReceipt;
    expectedProposalFingerprint: string;
    expectedSourceSetFingerprint: string;
    expectedAppliedChecksum?: string;
    expectedRuntimeTargetFingerprint?: string;
    now: number;
}): HarnessScopedApprovalDecision;
export declare function enterAuthorizedHarnessImprovement<T>(input: {
    decision: HarnessEntryDecision;
    enter: (authorization: Extract<HarnessEntryDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "entered";
    result: T;
} | Extract<HarnessEntryDecision, {
    status: "blocked";
}>>;
export declare function executeApprovedHarnessScope<T>(input: {
    requiredScope: HarnessApprovalScope;
    decision: HarnessScopedApprovalDecision;
    execute: (authorization: Extract<HarnessScopedApprovalDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "executed";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=harness-entry-approval-scope.d.ts.map