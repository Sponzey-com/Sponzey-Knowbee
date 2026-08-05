export interface RequestInstructionSnapshot {
    instructionId: string;
    sequence: number;
    text: string;
}
export interface RequestContextCandidate {
    contextRef: string;
    source: "conversation" | "memory";
    content: string;
}
export interface RequestIntakeContext {
    requestId: string;
    originalRequest: string;
    priorInstructions: RequestInstructionSnapshot[];
    latestInstruction: RequestInstructionSnapshot;
    contextCandidates: RequestContextCandidate[];
}
export interface LlmRequestContextAssessment {
    contextRef: string;
    relevant: boolean;
    reason: string;
}
export interface LlmRequestInstructionLineage {
    instructionId: string;
    sequence: number;
}
export interface LlmRequestIntakeDecision {
    schemaVersion: 1;
    requestId: string;
    originalRequest: string;
    goal: string;
    desiredResult: string;
    explicitExecutionMethod: string | null;
    completionCriteria: string[];
    forbiddenActions: string[];
    allowedTargets: string[];
    deliveryDestination: string | null;
    approvalRequiredSideEffects: string[];
    contextAssessments: LlmRequestContextAssessment[];
    selectedContextRefs: string[];
    instructionLineage: LlmRequestInstructionLineage[];
    latestInstructionId: string;
    reason: string;
}
export interface LlmRequestIntakeReceipt {
    schemaVersion: 1;
    receiptId: string;
    requestId: string;
    decisionFingerprint: `sha256:${string}`;
}
export interface LlmRequestIntakeProvider {
    analyzeRequest(context: RequestIntakeContext): LlmRequestIntakeDecision | Promise<LlmRequestIntakeDecision>;
}
export type LlmRequestIntakeRejectionCode = "intake_schema_invalid" | "request_context_invalid" | "request_scope_mismatch" | "original_request_mismatch" | "context_selection_invalid" | "instruction_lineage_invalid" | "latest_instruction_not_authoritative" | "intake_receipt_missing" | "intake_receipt_mismatch";
export type LlmRequestIntakeAdmission = {
    status: "admitted";
    requestId: string;
    originalRequest: string;
    goal: string;
    desiredResult: string;
    explicitExecutionMethod: string | null;
    latestInstructionId: string;
    selectedContextRefs: string[];
    constraints: {
        completionCriteria: string[];
        forbiddenActions: string[];
        allowedTargets: string[];
        deliveryDestination: string | null;
        approvalRequiredSideEffects: string[];
    };
    receiptId: string;
} | {
    status: "rejected";
    reasonCodes: LlmRequestIntakeRejectionCode[];
};
export declare function createLlmRequestIntakeReceipt(input: {
    receiptId: string;
    decision: LlmRequestIntakeDecision;
}): LlmRequestIntakeReceipt;
export declare function runLlmRequestIntakeProvider(input: {
    provider: LlmRequestIntakeProvider;
    receiptId: string;
    context: RequestIntakeContext;
}): Promise<{
    decision: LlmRequestIntakeDecision;
    receipt: LlmRequestIntakeReceipt;
}>;
export declare function admitLlmRequestIntake(input: {
    context: RequestIntakeContext;
    decision: LlmRequestIntakeDecision;
    receipt?: LlmRequestIntakeReceipt;
}): LlmRequestIntakeAdmission;
//# sourceMappingURL=llm-request-intake.d.ts.map