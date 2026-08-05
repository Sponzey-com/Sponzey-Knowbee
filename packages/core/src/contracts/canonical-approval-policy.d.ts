import type { ApprovalSourceDescriptor } from "./exact-source-approval.js";
import { type PromptImprovementHarnessChangeScope, type PromptImprovementHarnessGuardrail } from "../memory/prompt-improvement-harness.js";
export interface CanonicalApprovalRequest {
    changeKind: "prompt_source" | "harness";
    targetFiles: ApprovalSourceDescriptor[];
    changeSummary: string;
    riskLevel: "low" | "medium" | "high";
    invariantsAffected: string[];
    testsToRun: string[];
    rollbackPlan: string;
    activationMethod: "reload" | "restart" | "registry_activation" | "next_request_snapshot";
    harnessChangeScope?: PromptImprovementHarnessChangeScope[];
    harnessGuardrailsToPreserve?: PromptImprovementHarnessGuardrail[];
}
export type CanonicalApprovalRequestDecision = {
    status: "valid";
    request: CanonicalApprovalRequest;
} | {
    status: "blocked";
    reasonCode: "target_files_required" | "approval_field_missing" | "approval_list_invalid" | "harness_field_forbidden" | "harness_scope_required" | "harness_scope_invalid" | "harness_guardrail_missing" | "harness_guardrail_invalid";
    field?: string;
    guardrail?: PromptImprovementHarnessGuardrail;
};
export interface DefaultRiskApprovalReceipt {
    decision: "approved" | "denied";
    actorType: "user" | "administrator" | "system";
    actorId: string;
    explicitApproval: boolean;
    proposalFingerprint: string;
}
export type DefaultRiskApprovalDecision = {
    status: "authorized";
    risk: "low" | "medium" | "high";
    approvalMode: "tests_and_rollback" | "user_or_administrator" | "explicit";
} | {
    status: "blocked";
    reasonCode: "low_evidence_required" | "approval_required" | "approval_denied" | "approval_actor_invalid" | "explicit_approval_required";
};
export declare function validateCanonicalApprovalRequest(request: CanonicalApprovalRequest): CanonicalApprovalRequestDecision;
export declare function decideDefaultRiskApprovalPolicy(input: {
    risk: "low" | "medium" | "high";
    testsPassed: boolean;
    rollbackAvailable: boolean;
    expectedProposalFingerprint: string;
    approval?: DefaultRiskApprovalReceipt;
}): DefaultRiskApprovalDecision;
export declare function applyCanonicalApprovedChange<T>(input: {
    requestDecision: CanonicalApprovalRequestDecision;
    riskDecision: DefaultRiskApprovalDecision;
    apply: () => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=canonical-approval-policy.d.ts.map