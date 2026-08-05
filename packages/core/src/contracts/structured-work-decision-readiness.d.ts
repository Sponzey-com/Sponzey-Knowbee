import type { ContractValidationIssue } from "./index.js";
import type { LlmDiagnosisGateResult } from "./llm-diagnosis-gate.js";
import type { StructuredWorkClassification, StructuredWorkPlanDecision } from "./structured-work-lifecycle.js";
import { type RecommendedAction, type WorkRecordActionGatePhase } from "./work-record.js";
export interface StructuredWorkDecisionReadinessInput {
    workRecord?: unknown;
    phase: WorkRecordActionGatePhase;
    plan: StructuredWorkPlanDecision;
    diagnosisGate: LlmDiagnosisGateResult;
    selectedAction: RecommendedAction;
    rawStateRefs: string[];
}
export type StructuredWorkDecisionReadinessIssueCode = "structured_work_record_required" | "work_record_schema_invalid" | "work_plan_scope_mismatch" | "complex_step_count_invalid" | "step_contract_invalid" | "step_plan_mismatch" | "diagnosis_not_schema_valid" | "diagnosis_target_mismatch" | "diagnosis_receipt_required" | "diagnosis_record_mismatch" | "selected_action_mismatch" | "diagnosis_action_mismatch";
export interface StructuredWorkDecisionReadinessIssue {
    code: StructuredWorkDecisionReadinessIssueCode;
    path?: string;
    validationIssues?: ContractValidationIssue[];
}
export type StructuredWorkDecisionReadiness = {
    status: "ready";
    workId: string;
    phase: WorkRecordActionGatePhase;
    classification: StructuredWorkClassification;
    stepIds: string[];
    diagnosisReceiptId: string;
    selectedAction: RecommendedAction;
} | {
    status: "rejected";
    issues: StructuredWorkDecisionReadinessIssue[];
};
export declare function decideStructuredWorkDecisionReadiness(input: StructuredWorkDecisionReadinessInput): StructuredWorkDecisionReadiness;
//# sourceMappingURL=structured-work-decision-readiness.d.ts.map