export type CapabilitySelectionRisk = "safe" | "approval_required" | "denied";
export interface CapabilitySelectionBindingRef {
    capabilityId: string;
    targetId: string;
}
export interface CapabilitySelectionBinding extends CapabilitySelectionBindingRef {
    risk: CapabilitySelectionRisk;
}
export type CapabilitySelectionCandidateContext = (CapabilitySelectionBindingRef & {
    kind: "instruction_skill";
    content: string;
    checksum: `sha256:${string}`;
}) | (CapabilitySelectionBindingRef & {
    kind: "tool_bundle_skill";
    toolNames: string[];
});
export interface LlmCapabilityBindingAssessment extends CapabilitySelectionBindingRef {
    roleFit: "fit" | "partial" | "unfit";
    permission: "allowed" | "approval_required" | "denied";
    sideEffect: "none" | "read" | "write" | "external";
    evidenceQuality: "direct" | "indirect" | "unknown";
    dataExposure: "none" | "local_private" | "external_private" | "public";
    externalTransfer: boolean;
    cost: "none" | "low" | "high";
    strategyFingerprint: string;
    changedFromFailedStrategies: boolean;
    reason: string;
}
export interface CapabilitySelectionSnapshot {
    snapshotId: string;
    fingerprint: `sha256:${string}`;
    bindings: CapabilitySelectionBinding[];
    exclusions?: Array<CapabilitySelectionBindingRef & {
        reasonCodes: string[];
    }>;
    candidateContexts?: CapabilitySelectionCandidateContext[];
}
export interface LlmCapabilitySelectionDecision {
    schemaVersion: 1;
    runId: string;
    capabilitySnapshotId: string;
    capabilitySnapshotFingerprint: `sha256:${string}`;
    comparedBindings: CapabilitySelectionBindingRef[];
    bindingAssessments: LlmCapabilityBindingAssessment[];
    selectedBinding: CapabilitySelectionBindingRef;
    reason: string;
}
export interface LlmCapabilitySelectionReceipt {
    schemaVersion: 1;
    receiptId: string;
    runId: string;
    capabilitySnapshotId: string;
    capabilitySnapshotFingerprint: `sha256:${string}`;
    decisionFingerprint: string;
}
export interface LlmCapabilitySelectionContext {
    goal: string;
    constraints: string[];
    completionCriteria: string[];
    failedStrategyFingerprints: string[];
}
export interface LlmCapabilitySelectionProviderInput {
    runId: string;
    capabilitySnapshotId: string;
    capabilitySnapshotFingerprint: `sha256:${string}`;
    selectionContext: LlmCapabilitySelectionContext;
    executableBindings: CapabilitySelectionBinding[];
    candidateContexts: CapabilitySelectionCandidateContext[];
}
export interface LlmCapabilitySelectionProvider {
    selectCapability(input: LlmCapabilitySelectionProviderInput): LlmCapabilitySelectionDecision | Promise<LlmCapabilitySelectionDecision>;
}
export type LlmCapabilitySelectionAttemptResult = {
    status: "completed";
    output: unknown;
} | {
    status: "invalid_output";
    reasonCode: "invalid_json" | "json_object_required";
} | {
    status: "failed";
    reasonCode: "provider_failed" | "timed_out" | "output_limit_exceeded";
} | {
    status: "cancelled";
    reasonCode: "cancelled";
};
export interface LlmCapabilitySelectionAttemptProvider {
    attemptCapabilitySelection(input: LlmCapabilitySelectionProviderInput): LlmCapabilitySelectionAttemptResult | Promise<LlmCapabilitySelectionAttemptResult>;
}
export type LlmCapabilitySelectionValidationCode = "schema_version_invalid" | "run_id_required" | "snapshot_id_required" | "snapshot_fingerprint_invalid" | "compared_bindings_invalid" | "binding_assessments_invalid" | "selected_binding_invalid" | "reason_required";
export interface LlmCapabilitySelectionSchemaRepairProviderInput {
    subject: LlmCapabilitySelectionProviderInput;
    invalidOutput?: unknown;
    validationReasonCodes: Array<LlmCapabilitySelectionValidationCode | "invalid_json" | "json_object_required">;
    repairAttemptNumber: 1;
}
export interface LlmCapabilitySelectionSchemaRepairProvider {
    repairCapabilitySelection(input: LlmCapabilitySelectionSchemaRepairProviderInput): LlmCapabilitySelectionAttemptResult | Promise<LlmCapabilitySelectionAttemptResult>;
}
export type LlmCapabilitySelectionRejectionCode = "user_method_constraint_requires_policy_path" | "selection_schema_invalid" | "run_scope_mismatch" | "snapshot_scope_mismatch" | "selection_receipt_required" | "selection_receipt_mismatch" | "ambiguous_executable_snapshot" | "no_executable_candidates" | "executable_candidates_mismatch" | "binding_assessments_mismatch" | "binding_assessment_snapshot_mismatch" | "selected_binding_not_compared" | "selected_binding_unavailable" | "selected_binding_role_unfit" | "selected_binding_permission_denied" | "external_transfer_not_allowed" | "selection_cost_limit_exceeded" | "failed_strategy_reselected" | "changed_strategy_evidence_missing";
export declare const LLM_CAPABILITY_SELECTION_REJECTION_CODES: readonly ["user_method_constraint_requires_policy_path", "selection_schema_invalid", "run_scope_mismatch", "snapshot_scope_mismatch", "selection_receipt_required", "selection_receipt_mismatch", "ambiguous_executable_snapshot", "no_executable_candidates", "executable_candidates_mismatch", "binding_assessments_mismatch", "binding_assessment_snapshot_mismatch", "selected_binding_not_compared", "selected_binding_unavailable", "selected_binding_role_unfit", "selected_binding_permission_denied", "external_transfer_not_allowed", "selection_cost_limit_exceeded", "failed_strategy_reselected", "changed_strategy_evidence_missing"];
export type LlmCapabilitySelectionAdmission = {
    status: "allowed" | "approval_required";
    receiptId: string;
    selectedBinding: CapabilitySelectionBinding;
} | {
    status: "rejected";
    reasonCodes: LlmCapabilitySelectionRejectionCode[];
};
export type LlmCapabilitySelectionValidationResult = {
    valid: true;
    decision: LlmCapabilitySelectionDecision;
} | {
    valid: false;
    reasonCodes: LlmCapabilitySelectionValidationCode[];
};
export declare function validateLlmCapabilitySelectionDecision(value: unknown): LlmCapabilitySelectionValidationResult;
export declare function createLlmCapabilitySelectionReceipt(input: {
    receiptId: string;
    decision: LlmCapabilitySelectionDecision;
}): LlmCapabilitySelectionReceipt;
export declare function runLlmCapabilitySelectionProvider(input: {
    provider: LlmCapabilitySelectionProvider;
    receiptId: string;
    runId: string;
    capabilitySnapshot: CapabilitySelectionSnapshot;
    selectionContext: LlmCapabilitySelectionContext;
}): Promise<{
    decision: LlmCapabilitySelectionDecision;
    receipt: LlmCapabilitySelectionReceipt;
}>;
export declare function projectLlmCapabilitySelectionProviderInput(input: {
    runId: string;
    capabilitySnapshot: CapabilitySelectionSnapshot;
    selectionContext: LlmCapabilitySelectionContext;
}): LlmCapabilitySelectionProviderInput;
export declare function admitLlmCapabilitySelection(input: {
    runId: string;
    userMethodSpecified: boolean;
    externalTransferAllowed: boolean;
    maxCost: "none" | "low" | "high";
    failedStrategyFingerprints: string[];
    capabilitySnapshot: CapabilitySelectionSnapshot;
    decision: LlmCapabilitySelectionDecision;
    receipt?: LlmCapabilitySelectionReceipt;
}): LlmCapabilitySelectionAdmission;
//# sourceMappingURL=llm-capability-selection.d.ts.map