import type { WorkStepPlanItem } from "./work-record.js";
export interface LlmSolutionPlanPayload {
    ownerAgentName: string;
    steps: WorkStepPlanItem[];
}
export interface LlmSolutionPlanReceipt {
    schemaVersion: 1;
    receiptId: string;
    workId: string;
    runId: string;
    requestDiagnosisReceiptId: string;
    planFingerprint: `sha256:${string}`;
    issuedAt: number;
}
export type LlmSolutionPlanReceiptValidationReason = "solution_plan_receipt_missing" | "solution_plan_receipt_invalid" | "solution_plan_scope_mismatch" | "solution_plan_diagnosis_mismatch" | "solution_plan_order_invalid" | "solution_plan_fingerprint_mismatch";
export declare function createLlmSolutionPlanReceipt(input: {
    receiptId: string;
    workId: string;
    runId: string;
    requestDiagnosisReceiptId: string;
    requestDiagnosisIssuedAt: number;
    issuedAt: number;
    plan: LlmSolutionPlanPayload;
}): LlmSolutionPlanReceipt;
export declare function validateLlmSolutionPlanReceipt(input: {
    receipt: LlmSolutionPlanReceipt | undefined;
    workId: string;
    runId: string;
    requestDiagnosisReceiptId: string;
    requestDiagnosisIssuedAt: number;
    plan: LlmSolutionPlanPayload;
}): {
    ok: true;
} | {
    ok: false;
    reasonCode: LlmSolutionPlanReceiptValidationReason;
};
//# sourceMappingURL=llm-solution-plan-receipt.d.ts.map