import type { StructuredWorkPlanDecision } from "./structured-work-lifecycle.js";
import { type ActionDecision, type FailureDiagnosis, type LlmRequestDiagnosisRecord, type LlmResultDiagnosisRecord, type RecoveryCandidate, type WorkRecord, type WorkRecordSource, type WorkRecordStatus, type WorkStepResult } from "./work-record.js";
export declare const STRUCTURED_WORK_TEXT_LIMIT: 500;
export interface WorkRecordFailureBundle {
    failureDiagnosis: FailureDiagnosis;
    recoveryCandidates: RecoveryCandidate[];
    selectedRecoveryAction?: RecoveryCandidate;
}
export interface AssembleCanonicalWorkRecordInput {
    plan: StructuredWorkPlanDecision;
    parentWorkId?: string;
    source: WorkRecordSource;
    status: WorkRecordStatus;
    userRequestSummary: string;
    requestDiagnosis: LlmRequestDiagnosisRecord;
    stepResults: WorkStepResult[];
    resultDiagnosis: LlmResultDiagnosisRecord;
    actionDecision: ActionDecision;
    retryCount: number;
    retryLimit: number;
    terminationCondition: string;
    failureBundle?: WorkRecordFailureBundle;
    unblockEvidence?: string[];
}
export declare function assembleCanonicalWorkRecord(input: AssembleCanonicalWorkRecordInput): WorkRecord;
//# sourceMappingURL=work-record-assembly.d.ts.map