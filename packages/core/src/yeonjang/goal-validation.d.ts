import { type LlmDiagnosisProvider } from "../contracts/llm-diagnosis-provider.js";
import type { LlmDiagnosisReceipt } from "../contracts/diagnosis-action-routing.js";
import type { LlmResultDiagnosisRecord } from "../contracts/work-record.js";
import { type YeonjangEvidencePostCheck } from "./evidence.js";
export type YeonjangGoalValidationReasonCode = "result_diagnosis_invalid" | "result_diagnosis_receipt_missing" | "result_diagnosis_not_sufficient" | "result_diagnosis_action_not_final" | "result_diagnosis_has_gaps" | "result_diagnosis_route_invalid" | "result_diagnosis_provider_failed";
export type YeonjangGoalValidationResult = {
    status: "validated";
    diagnosis: LlmResultDiagnosisRecord;
    receipt: LlmDiagnosisReceipt;
    postCheck: Extract<YeonjangEvidencePostCheck, {
        kind: "goal_validated";
    }>;
} | {
    status: "not_validated";
    reasonCode: YeonjangGoalValidationReasonCode;
    diagnosis?: LlmResultDiagnosisRecord;
    receipt?: LlmDiagnosisReceipt;
};
export interface ValidateYeonjangGoalWithLlmInput {
    provider: LlmDiagnosisProvider;
    ownerAgentName: string;
    workId?: string;
    stepId: string;
    toolName: string;
    userRequestSummary: string;
    expectedOutput: string;
    publicToolOutput: string;
    sanitizedObservedStateSummary: string;
    evidenceRefs: string[];
    risks?: string[];
}
export declare function validateYeonjangGoalWithLlm(input: ValidateYeonjangGoalWithLlmInput): Promise<YeonjangGoalValidationResult>;
//# sourceMappingURL=goal-validation.d.ts.map