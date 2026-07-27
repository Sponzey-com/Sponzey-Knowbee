import type { LlmDiagnosisReceipt } from "./diagnosis-action-routing.js";
import type { StructuredWorkLifecycleProjection, StructuredWorkPlanDecision } from "./structured-work-lifecycle.js";
import type { RecommendedAction } from "./work-record.js";
export interface ScopedLlmDiagnosisReceipt {
    workId: string;
    runId: string;
    receipt: LlmDiagnosisReceipt;
}
export interface LlmDiagnosedActionFlowInput {
    workId: string;
    runId: string;
    requestDiagnosis?: ScopedLlmDiagnosisReceipt;
    resultDiagnosis?: ScopedLlmDiagnosisReceipt;
    plan: StructuredWorkPlanDecision;
    projection: StructuredWorkLifecycleProjection;
    selectedAction: RecommendedAction;
    rawInputRefs: string[];
    rawResultRefs: string[];
}
export type LlmDiagnosedActionFlowIssueCode = "work_id_required" | "run_id_required" | "request_diagnosis_missing" | "result_diagnosis_missing" | "raw_input_not_authoritative" | "raw_result_not_authoritative" | "request_diagnosis_scope_mismatch" | "result_diagnosis_scope_mismatch" | "request_diagnosis_target_invalid" | "result_diagnosis_target_invalid" | "request_action_mismatch" | "diagnosis_action_mismatch" | "plan_scope_mismatch" | "projection_scope_mismatch" | "request_receipt_reference_mismatch" | "plan_receipt_reference_mismatch" | "result_receipt_reference_mismatch" | "trace_work_scope_mismatch" | "required_trace_phase_missing" | "trace_phase_order_invalid" | "selected_action_trace_mismatch";
export interface LlmDiagnosedActionFlowIssue {
    code: LlmDiagnosedActionFlowIssueCode;
    path?: string;
}
export type LlmDiagnosedActionFlowAcceptance = {
    status: "accepted";
    workId: string;
    runId: string;
    requestReceiptId: string;
    resultReceiptId: string;
    selectedAction: RecommendedAction;
    traceReasonCodes: string[];
} | {
    status: "rejected";
    workId: string;
    runId: string;
    issues: LlmDiagnosedActionFlowIssue[];
};
export declare function decideLlmDiagnosedActionFlowAcceptance(input: LlmDiagnosedActionFlowInput): LlmDiagnosedActionFlowAcceptance;
//# sourceMappingURL=llm-diagnosed-action-flow.d.ts.map