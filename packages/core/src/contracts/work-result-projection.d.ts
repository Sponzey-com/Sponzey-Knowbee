import type { ContractValidationResult } from "./index.js";
import type { ResultReport } from "./sub-agent-orchestration.js";
import { type ActionDecision, type ChildWorkResult, type FailureDiagnosis, type LlmResultDiagnosisRecord, type RecoveryCandidate } from "./work-record.js";
export interface RuntimeChildResultReviewSnapshot {
    accepted: boolean;
    status: "completed" | "needs_revision" | "failed";
    missingItems: string[];
    requiredChanges: string[];
    risksOrGaps: string[];
    canRetry: boolean;
    impossibleReason?: ResultReport["impossibleReason"];
}
export interface RuntimeChildWorkResultProjectionInput {
    resultReport: ResultReport;
    agentName: string;
    taskGoal: string;
    resultDiagnosis: LlmResultDiagnosisRecord;
    actionDecision: ActionDecision;
    review?: RuntimeChildResultReviewSnapshot;
    completedStepIds?: string[];
    failedStepIds?: string[];
    assumptions?: string[];
    actionsTaken?: string[];
    toolsUsed?: string[];
    failureDiagnosis?: FailureDiagnosis;
    recoveryAttempts?: RecoveryCandidate[];
    recommendedNextStep?: string;
}
export declare function buildRuntimeChildWorkResult(input: RuntimeChildWorkResultProjectionInput): ContractValidationResult<ChildWorkResult>;
//# sourceMappingURL=work-result-projection.d.ts.map