import type { ContractValidationResult, JsonValue } from "./index.js";
export declare const WORK_RECORD_SCHEMA_VERSION: 1;
export type WorkRecordSource = "user" | "parent_agent" | "system" | "scheduled";
export type WorkRecordStatus = "intake" | "planned" | "running" | "waiting" | "completed" | "partial" | "blocked" | "failed" | "cancelled";
export type RecommendedAction = "direct_answer" | "ask_clarification" | "plan" | "delegate" | "use_tool" | "use_yeonjang" | "retry" | "redelegate" | "partial_report" | "final_report" | "stop_blocked";
export type WorkStepActionType = "direct_answer" | "plan" | "delegate" | "use_tool" | "use_yeonjang" | "ask_clarification" | "validate" | "report";
export type WorkStepStatus = "pending" | "running" | "completed" | "blocked" | "failed" | "skipped";
export type WorkStepResultStatus = "completed" | "partial" | "blocked" | "failed";
export type ResultSufficiency = "sufficient" | "partial" | "insufficient" | "unknown";
export type RecoveryChangedDimension = "input" | "strategy" | "tool" | "delegation_target" | "permission" | "scope" | "validation_method";
export type WorkHandoffMemoryVisibility = "explicit_handoff_only";
export type WorkHandoffReturnFormat = "ChildWorkResult";
export interface LlmRequestDiagnosisRecord {
    diagnosis_summary: string;
    intent: string;
    goal: string;
    constraints: string[];
    missing_information: string[];
    risk: string;
    confidence: string;
    recommended_action: RecommendedAction;
    reason: string;
}
export interface LlmResultDiagnosisRecord {
    diagnosis_summary: string;
    sufficiency: ResultSufficiency;
    missing_information: string[];
    conflicts: string[];
    risk: string;
    risks: string[];
    confidence: string;
    recommended_action: RecommendedAction;
    reason: string;
}
export interface WorkStepPlanItem {
    step_id: string;
    owner_agent_name: string;
    action_type: WorkStepActionType;
    input_refs: string[];
    expected_output: string;
    completion_criteria: string;
    status: WorkStepStatus;
}
export interface WorkStepResult {
    step_id: string;
    status: WorkStepResultStatus;
    output_ref?: string;
    evidence_refs: string[];
    error?: string;
    completed_at?: number;
}
export interface FailureDiagnosis {
    failed_step_id: string;
    failure_reason: string;
    failed_input_refs: string[];
    failed_strategy: string;
    recoverable: boolean;
}
export type WorkBlockerKind = "missing_information" | "permission" | "resource" | "safety";
export interface ActiveWorkBlocker {
    blocker_kind: WorkBlockerKind;
    blocker_ref: string;
    step_id?: string;
    evidence_refs: string[];
}
export interface BlockerResolutionReceipt {
    receipt_id: string;
    work_id: string;
    blocker_kind: WorkBlockerKind;
    blocker_ref: string;
    resolution_evidence_refs: string[];
    verified: boolean;
}
export interface RecoveryCandidate {
    action_type: RecommendedAction;
    changed_input_or_strategy: string;
    expected_benefit: string;
    risk: string;
    required_permission?: string;
    changed_dimensions: RecoveryChangedDimension[];
    metadata?: Record<string, JsonValue | undefined>;
}
export interface ActionDecision {
    selected_action: RecommendedAction;
    reason: string;
    next_step_id?: string;
}
export interface WorkRecord {
    schemaVersion: typeof WORK_RECORD_SCHEMA_VERSION;
    work_id: string;
    parent_work_id?: string;
    owner_agent_name: string;
    source: WorkRecordSource;
    status: WorkRecordStatus;
    user_request_summary: string;
    request_diagnosis: LlmRequestDiagnosisRecord;
    step_plan: WorkStepPlanItem[];
    step_results: WorkStepResult[];
    result_diagnosis: LlmResultDiagnosisRecord;
    failure_diagnosis?: FailureDiagnosis;
    recovery_candidates?: RecoveryCandidate[];
    selected_recovery_action?: RecoveryCandidate;
    active_blocker?: ActiveWorkBlocker;
    blocker_resolution?: BlockerResolutionReceipt;
    unblock_evidence?: string[];
    retry_count: number;
    retry_limit: number;
    stop_condition?: string;
    action_decision: ActionDecision;
}
export interface WorkHandoffPackage {
    schemaVersion: typeof WORK_RECORD_SCHEMA_VERSION;
    handoff_id: string;
    work_id: string;
    parent_work_id: string;
    parent_step_id: string;
    parent_agent_name: string;
    target_agent_name: string;
    task_goal: string;
    user_request_summary: string;
    request_diagnosis: LlmRequestDiagnosisRecord;
    step_plan: WorkStepPlanItem[];
    current_step: WorkStepPlanItem;
    context: string[];
    constraints: string[];
    allowed_tools: string[];
    disallowed_actions: string[];
    expected_output: string;
    quality_criteria: string[];
    validation_method: string;
    retry_limit: number;
    stop_condition: string;
    failure_recovery_policy: string;
    deadline_or_budget: string;
    memory_visibility: WorkHandoffMemoryVisibility;
    return_format: WorkHandoffReturnFormat;
}
export type ChildWorkResultStatus = "completed" | "partial" | "blocked" | "failed";
export interface ChildWorkResult {
    schemaVersion: typeof WORK_RECORD_SCHEMA_VERSION;
    work_id: string;
    agent_name: string;
    task_goal: string;
    status: ChildWorkResultStatus;
    completed_steps: string[];
    failed_steps: string[];
    summary: string;
    result: string;
    evidence: string[];
    assumptions: string[];
    risks: string[];
    missing_information: string[];
    actions_taken: string[];
    tools_used: string[];
    result_diagnosis: LlmResultDiagnosisRecord;
    action_decision: ActionDecision;
    failure_diagnosis: FailureDiagnosis | null;
    recovery_attempts: RecoveryCandidate[];
    needs_parent_review: boolean;
    recommended_next_step: string;
}
export interface WorkRecordTransitionResult {
    ok: boolean;
    reasonCode?: "invalid_structured_record" | "transition_not_allowed" | "recovery_action_required" | "recovery_action_invalid" | "completion_criteria_not_met" | "partial_criteria_not_met" | "blocker_resolution_required";
    message?: string;
}
export type WorkRecordActionGatePhase = "request" | "result";
export declare const WORK_HANDOFF_TEXT_LIMITS: Readonly<{
    scalarCharacters: 2048;
    arrayItemCharacters: 1024;
    arrayItems: 32;
    arrayAggregateCharacters: 8192;
}>;
export declare const STRUCTURED_INTERNAL_TEXT_LIMITS: Readonly<{
    scalarCharacters: 500;
    arrayItemCharacters: 500;
    arrayItems: 32;
    arrayAggregateCharacters: 4096;
}>;
export declare const WORK_RECORD_STATUS_TRANSITIONS: Readonly<Record<WorkRecordStatus, readonly WorkRecordStatus[]>>;
export declare function isDeclaredWorkRecordStatusTransition(fromStatus: WorkRecordStatus, toStatus: WorkRecordStatus): boolean;
export declare function validateLlmRequestDiagnosisRecord(value: unknown): ContractValidationResult<LlmRequestDiagnosisRecord>;
export declare function validateLlmResultDiagnosisRecord(value: unknown): ContractValidationResult<LlmResultDiagnosisRecord>;
export declare function validateWorkRecord(value: unknown): ContractValidationResult<WorkRecord>;
export type WorkRecordRunningExitDecision = {
    status: "completed";
    reasonCode: "completion_criteria_met";
    targetStatus: "completed";
    completedStepIds: string[];
    evidenceRefs: string[];
} | {
    status: "partial";
    reasonCode: "partial_criteria_met";
    targetStatus: "partial";
    achievedStepIds: string[];
    unmetStepIds: string[];
    failedStepId: string;
    failureReason: string;
    recoveryCandidates: RecoveryCandidate[];
    nextAction: RecommendedAction;
} | {
    status: "rejected";
    reasonCode: "running_status_required" | "completion_criteria_not_met" | "partial_criteria_not_met";
    targetStatus: null;
};
export declare function decideWorkRecordRunningExit(record: WorkRecord, targetStatus: "completed" | "partial"): WorkRecordRunningExitDecision;
export type WorkRecoveryReentryDecision = {
    status: "resume_planned";
    reasonCode: "changed_recovery_selected";
    targetStatus: "planned";
    selectedRecoveryAction: RecoveryCandidate;
} | {
    status: "resume_planned";
    reasonCode: "blocker_resolved";
    targetStatus: "planned";
    resolutionReceiptId: string;
} | {
    status: "stay_blocked";
    reasonCode: "blocker_resolution_required";
    targetStatus: "blocked";
} | {
    status: "rejected";
    reasonCode: NonNullable<WorkRecordTransitionResult["reasonCode"]> | "recovery_status_required";
    targetStatus: null;
};
export declare function decideWorkRecordRecoveryReentry(record: WorkRecord): WorkRecoveryReentryDecision;
export declare function canTransitionWorkRecordStatus(record: WorkRecord, nextStatus: WorkRecordStatus): WorkRecordTransitionResult;
export declare function validateRecoveryCandidateAgainstFailure(failure: FailureDiagnosis, candidate: RecoveryCandidate): ContractValidationResult<RecoveryCandidate>;
export declare function validateWorkHandoffPackage(value: unknown): ContractValidationResult<WorkHandoffPackage>;
export declare function validateChildWorkResult(value: unknown): ContractValidationResult<ChildWorkResult>;
export declare function validateWorkRecordActionGate(value: unknown, phase: WorkRecordActionGatePhase): ContractValidationResult<WorkRecord>;
//# sourceMappingURL=work-record.d.ts.map