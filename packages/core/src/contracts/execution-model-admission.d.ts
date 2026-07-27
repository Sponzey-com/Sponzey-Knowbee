export type ExecutionModel = "direct_sequential" | "safe_read_sequential" | "managed_state_machine";
export interface ExecutionModelStep {
    stepId: string;
    actionKind: "direct_response" | "read" | "write" | "external" | "delegate" | "validate";
    sideEffect: "none" | "write" | "external" | "destructive";
    requiresApproval: boolean;
    retryOrReentryPossible: boolean;
}
export interface ExecutionStepReceipt {
    receiptId: string;
    workId: string;
    stepId: string;
    status: "succeeded" | "failed";
}
export interface ExecutionModelInput {
    requestId: string;
    workId: string;
    executionContractReceiptId: string;
    steps: ExecutionModelStep[];
    executionReceipts: ExecutionStepReceipt[];
    completionRequested: boolean;
}
export interface ExecutionModelDecision {
    schemaVersion: 1;
    requestId: string;
    workId: string;
    executionContractReceiptId: string;
    selectedMode: ExecutionModel;
    reason: string;
}
export interface ExecutionModelReceipt {
    schemaVersion: 1;
    receiptId: string;
    requestId: string;
    workId: string;
    decisionFingerprint: `sha256:${string}`;
}
export type ExecutionModelRejectionCode = "execution_model_schema_invalid" | "execution_model_scope_mismatch" | "execution_mode_mismatch" | "execution_receipt_invalid" | "execution_receipt_scope_mismatch" | "analyzed_steps_not_executed" | "execution_model_receipt_missing" | "execution_model_receipt_mismatch";
export type ExecutionModelAdmission = {
    status: "ready_to_execute";
    requestId: string;
    workId: string;
    selectedMode: ExecutionModel;
    pendingStepIds: string[];
    receiptId: string;
} | {
    status: "completed";
    requestId: string;
    workId: string;
    selectedMode: ExecutionModel;
    executedStepIds: string[];
    receiptId: string;
} | {
    status: "rejected";
    reasonCodes: ExecutionModelRejectionCode[];
};
export declare function createExecutionModelReceipt(input: {
    receiptId: string;
    decision: ExecutionModelDecision;
}): ExecutionModelReceipt;
export declare function admitExecutionModel(input: {
    input: ExecutionModelInput;
    decision: ExecutionModelDecision;
    receipt?: ExecutionModelReceipt;
}): ExecutionModelAdmission;
//# sourceMappingURL=execution-model-admission.d.ts.map