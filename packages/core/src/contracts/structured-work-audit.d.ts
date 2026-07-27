import type { ContractValidationIssue } from "./index.js";
import { type RuntimeWorkHandoffProjectionInput } from "./work-handoff-projection.js";
import { type RuntimeChildWorkResultProjectionInput } from "./work-result-projection.js";
import { type ActionDecision, type ChildWorkResult, type LlmRequestDiagnosisRecord, type LlmResultDiagnosisRecord, type WorkRecord, type WorkRecordStatus, type WorkRecordTransitionResult, type WorkHandoffPackage } from "./work-record.js";
export type StructuredWorkAuditKind = "handoff_projection" | "child_result_projection" | "status_transition";
export type StructuredWorkAuditStatus = "valid" | "invalid" | "skipped";
export type StructuredWorkTransitionReasonCode = NonNullable<WorkRecordTransitionResult["reasonCode"]>;
export type StructuredWorkAuditReasonCode = "missing_runtime_diagnosis" | "invalid_runtime_diagnosis" | "projection_invalid" | StructuredWorkTransitionReasonCode;
export interface StructuredWorkAuditProductLog {
    enabled: false;
    summary: string;
}
export interface StructuredWorkAuditFieldDebugLog {
    level: "debug";
    summary: string;
    reasonCode?: StructuredWorkAuditReasonCode;
    issueCount: number;
    issuePaths: string[];
}
export interface StructuredWorkAuditDevelopmentLog {
    level: "dev";
    validationIssues: ContractValidationIssue[];
    transition?: StructuredWorkTransitionDevelopmentLog;
}
export interface StructuredWorkTransitionDevelopmentLog {
    fromStatus: WorkRecordStatus;
    toStatus: WorkRecordStatus;
    reasonCode: StructuredWorkTransitionReasonCode;
    message: string;
}
export interface StructuredWorkAuditResult<TValue> {
    auditKind: StructuredWorkAuditKind;
    status: StructuredWorkAuditStatus;
    blocking: false;
    reasonCode?: StructuredWorkAuditReasonCode;
    value?: TValue;
    productLog: StructuredWorkAuditProductLog;
    fieldDebugLog: StructuredWorkAuditFieldDebugLog;
    developmentLog: StructuredWorkAuditDevelopmentLog;
}
export interface AuditedWorkRecordStatusTransitionApplicationResult {
    ok: boolean;
    changed: boolean;
    record: WorkRecord;
    transition: WorkRecordTransitionResult;
    audit: StructuredWorkAuditResult<WorkRecordTransitionResult>;
}
export type RuntimeWorkHandoffAuditInput = Omit<RuntimeWorkHandoffProjectionInput, "requestDiagnosis"> & {
    requestDiagnosis?: LlmRequestDiagnosisRecord;
};
export type RuntimeChildWorkResultAuditInput = Omit<RuntimeChildWorkResultProjectionInput, "resultDiagnosis" | "actionDecision"> & {
    resultDiagnosis?: LlmResultDiagnosisRecord;
    actionDecision?: ActionDecision;
};
export declare function auditWorkRecordStatusTransition(record: WorkRecord, nextStatus: WorkRecordStatus): StructuredWorkAuditResult<WorkRecordTransitionResult>;
export declare function applyAuditedWorkRecordStatusTransition(record: WorkRecord, nextStatus: WorkRecordStatus): AuditedWorkRecordStatusTransitionApplicationResult;
export declare function auditRuntimeWorkHandoffProjection(input: RuntimeWorkHandoffAuditInput): StructuredWorkAuditResult<WorkHandoffPackage>;
export declare function auditRuntimeChildWorkResultProjection(input: RuntimeChildWorkResultAuditInput): StructuredWorkAuditResult<ChildWorkResult>;
//# sourceMappingURL=structured-work-audit.d.ts.map