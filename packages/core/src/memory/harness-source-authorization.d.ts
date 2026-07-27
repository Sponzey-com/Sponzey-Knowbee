import { type PromptImprovementHarnessGuardrail } from "./prompt-improvement-harness.js";
export declare const HARNESS_MUTABLE_SOURCE_KINDS: readonly ["approval_policy", "state_machine", "harness_core", "input_output_schema", "activation_rollback_procedure", "test_fixture"];
export type HarnessMutableSourceKind = typeof HARNESS_MUTABLE_SOURCE_KINDS[number];
export interface HarnessMutableSourceDescriptor {
    sourceKind: HarnessMutableSourceKind;
    sourceRef: string;
    baselineVersion: string;
    baselineChecksum: string;
}
export interface ExplicitHarnessUserRequestReceipt {
    requestId: string;
    requester: string;
    requesterType: "user" | "administrator";
    requestedSourceRefs: string[];
    requestedAt: number;
    expiresAt: number;
}
export interface HarnessSourceApprovalReceipt {
    approvalId: string;
    approvedBy: string;
    approvedSourceRefs: string[];
    approvedAt: number;
    expiresAt: number;
}
export type HarnessSourceAuthorizationDecision = {
    status: "authorized";
    source: HarnessMutableSourceDescriptor;
    requestId: string;
    approvalId: string;
} | {
    status: "blocked";
    reasonCode: "source_kind_invalid" | "source_ref_invalid" | "source_lineage_invalid" | "explicit_user_request_missing" | "request_expired" | "request_scope_mismatch" | "approval_missing" | "approval_expired" | "approval_scope_mismatch";
};
export type HarnessGuardrailDisposition = "preserved" | "weakened" | "disabled";
export interface HarnessGuardrailSnapshotEntry {
    guardrail: PromptImprovementHarnessGuardrail;
    disposition: HarnessGuardrailDisposition;
}
export type HarnessApplicationAuthorizationDecision = {
    status: "authorized";
    fixedRisk: "high";
    guardrails: readonly PromptImprovementHarnessGuardrail[];
} | {
    status: "blocked";
    reasonCode: "baseline_guardrail_snapshot_invalid" | "proposed_guardrail_missing" | "proposed_guardrail_weakened" | "harness_risk_downgrade_forbidden" | "high_risk_approval_required";
    guardrail?: PromptImprovementHarnessGuardrail;
};
export declare function authorizeHarnessApplication(input: {
    declaredRisk: "low" | "medium" | "high";
    approvedRisk?: "low" | "medium" | "high";
    baselineGuardrails: readonly HarnessGuardrailSnapshotEntry[];
    proposedGuardrails: readonly HarnessGuardrailSnapshotEntry[];
}): HarnessApplicationAuthorizationDecision;
export declare function executeAuthorizedHarnessApplication<T>(input: {
    decision: HarnessApplicationAuthorizationDecision;
    apply: () => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Extract<HarnessApplicationAuthorizationDecision, {
    status: "blocked";
}>>;
export declare function authorizeHarnessSourceMutation(input: {
    source: Partial<HarnessMutableSourceDescriptor>;
    userRequest?: ExplicitHarnessUserRequestReceipt;
    approval?: HarnessSourceApprovalReceipt;
    now: number;
}): HarnessSourceAuthorizationDecision;
export declare function executeAuthorizedHarnessSourceMutation<T>(input: {
    decision: HarnessSourceAuthorizationDecision;
    writerKind: HarnessMutableSourceKind;
    write: (source: HarnessMutableSourceDescriptor) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=harness-source-authorization.d.ts.map