export interface MissingInformationResolutionCandidate {
    fieldId: string;
    description: string;
    systemCanResolve: boolean;
    capabilityRefs: string[];
}
export interface LlmClarificationInput {
    requestId: string;
    originalRequest: string;
    missingInformationCandidates: MissingInformationResolutionCandidate[];
}
export interface LlmMissingInformationAssessment {
    fieldId: string;
    impact: "changes_result" | "does_not_change_result";
    reason: string;
}
export interface LlmClarificationDecision {
    schemaVersion: 1;
    requestId: string;
    requestMeaning: string;
    completionCriteria: string[];
    missingInformationAssessments: LlmMissingInformationAssessment[];
    selectedAction: "ask_clarification" | "continue";
    clarificationFieldIds: string[];
    clarificationQuestion: string | null;
    reason: string;
}
export interface LlmClarificationReceipt {
    schemaVersion: 1;
    receiptId: string;
    requestId: string;
    decisionFingerprint: `sha256:${string}`;
}
export interface LlmClarificationProvider {
    analyzeClarification(input: LlmClarificationInput): LlmClarificationDecision | Promise<LlmClarificationDecision>;
}
export type LlmClarificationRejectionCode = "clarification_schema_invalid" | "capability_snapshot_invalid" | "request_scope_mismatch" | "missing_candidate_assessment_mismatch" | "clarification_not_required" | "material_user_information_not_requested" | "clarification_targets_mismatch" | "system_resolvable_information_requested" | "clarification_receipt_missing" | "clarification_receipt_mismatch";
export type LlmClarificationAdmission = {
    status: "clarification_required";
    requestId: string;
    requestMeaning: string;
    completionCriteria: string[];
    clarificationFieldIds: string[];
    clarificationQuestion: string;
    receiptId: string;
} | {
    status: "continue";
    requestId: string;
    requestMeaning: string;
    completionCriteria: string[];
    receiptId: string;
} | {
    status: "rejected";
    reasonCodes: LlmClarificationRejectionCode[];
};
export declare function createLlmClarificationReceipt(input: {
    receiptId: string;
    decision: LlmClarificationDecision;
}): LlmClarificationReceipt;
export declare function runLlmClarificationProvider(input: {
    provider: LlmClarificationProvider;
    receiptId: string;
    input: LlmClarificationInput;
}): Promise<{
    decision: LlmClarificationDecision;
    receipt: LlmClarificationReceipt;
}>;
export declare function admitLlmClarification(input: {
    input: LlmClarificationInput;
    decision: LlmClarificationDecision;
    receipt?: LlmClarificationReceipt;
}): LlmClarificationAdmission;
//# sourceMappingURL=llm-clarification-admission.d.ts.map