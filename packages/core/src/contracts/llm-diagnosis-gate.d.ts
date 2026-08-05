import { type BlockInvalidStructuredRecordDecision, type AttemptStructuredRecordRepairDecision } from "./structured-record-repair.js";
import { type LlmRequestDiagnosisRecord, type LlmResultDiagnosisRecord } from "./work-record.js";
import { type DiagnosisSubjectKind, type LlmDiagnosisReceipt } from "./diagnosis-action-routing.js";
export type LlmDiagnosisGateTarget = "request_diagnosis" | "result_diagnosis";
export interface LlmDiagnosisGateInput {
    target: LlmDiagnosisGateTarget;
    rawOutput: unknown;
    ownerAgentName: string;
    workId?: string;
    failedStepId: string;
    failedInputRefs: string[];
    failedStrategy: string;
    repairAttempted: boolean;
    receiptBinding?: {
        receiptId: string;
        subjectKind: DiagnosisSubjectKind;
        subjectPayload: unknown;
    };
}
export type ValidLlmDiagnosisGateResult = {
    status: "valid";
    target: "request_diagnosis";
    diagnosis: LlmRequestDiagnosisRecord;
    receipt?: LlmDiagnosisReceipt;
} | {
    status: "valid";
    target: "result_diagnosis";
    diagnosis: LlmResultDiagnosisRecord;
    receipt?: LlmDiagnosisReceipt;
};
export interface RepairRequiredLlmDiagnosisGateResult {
    status: "repair_required";
    target: LlmDiagnosisGateTarget;
    repairDecision: AttemptStructuredRecordRepairDecision;
}
export interface BlockedLlmDiagnosisGateResult {
    status: "blocked";
    target: LlmDiagnosisGateTarget;
    repairDecision: BlockInvalidStructuredRecordDecision;
}
export type LlmDiagnosisGateResult = ValidLlmDiagnosisGateResult | RepairRequiredLlmDiagnosisGateResult | BlockedLlmDiagnosisGateResult;
export declare function gateLlmDiagnosisOutput(input: LlmDiagnosisGateInput): LlmDiagnosisGateResult;
//# sourceMappingURL=llm-diagnosis-gate.d.ts.map