export interface StructuredExecutionContractInput {
    requestId: string;
    workId: string;
    diagnosisReceiptId: string;
    diagnosedGoal: string;
    diagnosedConstraints: string[];
    diagnosedCompletionCriteria: string[];
}
export interface StructuredExecutionStepDecision {
    stepId: string;
    ownerAgentName: string;
    selectedMeans: string[];
    expectedOutput: string;
    completionCriteria: string[];
    sideEffects: string[];
    risks: string[];
    requiredApprovals: string[];
    validationMethod: string;
}
export interface StructuredExecutionContractDecision {
    schemaVersion: 1;
    requestId: string;
    workId: string;
    diagnosisReceiptId: string;
    goal: string;
    userConstraints: string[];
    completionCriteria: string[];
    steps: StructuredExecutionStepDecision[];
    nextActionStepId: string;
    reason: string;
}
export interface StructuredExecutionContractReceipt {
    schemaVersion: 1;
    receiptId: string;
    requestId: string;
    workId: string;
    decisionFingerprint: `sha256:${string}`;
}
export type StructuredExecutionContractRejectionCode = "execution_contract_schema_invalid" | "execution_scope_mismatch" | "goal_lineage_mismatch" | "constraint_lineage_mismatch" | "completion_lineage_mismatch" | "next_action_step_missing" | "execution_contract_receipt_missing" | "execution_contract_receipt_mismatch";
export type StructuredExecutionContractAdmission = {
    status: "admitted";
    requestId: string;
    workId: string;
    goal: string;
    userConstraints: string[];
    completionCriteria: string[];
    stepIds: string[];
    nextActionStepId: string;
    receiptId: string;
} | {
    status: "rejected";
    reasonCodes: StructuredExecutionContractRejectionCode[];
};
export declare function createStructuredExecutionContractReceipt(input: {
    receiptId: string;
    decision: StructuredExecutionContractDecision;
}): StructuredExecutionContractReceipt;
export declare function admitStructuredExecutionContract(input: {
    input: StructuredExecutionContractInput;
    decision: StructuredExecutionContractDecision;
    receipt?: StructuredExecutionContractReceipt;
}): StructuredExecutionContractAdmission;
//# sourceMappingURL=structured-execution-contract.d.ts.map