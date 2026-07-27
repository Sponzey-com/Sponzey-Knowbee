import { type LlmDiagnosisReceipt } from "./diagnosis-action-routing.js";
import { type FailureDiagnosis, type LlmResultDiagnosisRecord, type RecoveryCandidate, type RecoveryChangedDimension } from "./work-record.js";
export type FailureRecoveryState = "diagnosing" | "generating_candidates" | "reviewing_constraints" | "selecting_action" | "retry_ready" | "report_ready" | "stopped";
export type FailureRecoveryEvent = "diagnosis_recorded" | "candidates_generated" | "constraints_reviewed" | "retry_selected" | "partial_report_selected" | "stop_selected";
export type RecoveryStopCondition = "goal_achieved" | "permission_denied" | "safety_risk" | "required_resource_unavailable" | "alternatives_exhausted";
export interface RecoveryCandidateConstraintReview {
    candidateIndex: number;
    safety: "allowed" | "denied";
    permission: "allowed" | "denied";
    resource: "available" | "unavailable";
    evidenceRefs: string[];
}
export interface RecoveryStopRecord {
    condition: RecoveryStopCondition;
    reason: string;
    evidenceRefs: string[];
    partialResultRefs?: string[];
    unresolvedScope: string[];
    userActions: string[];
}
export interface RecoveryPartialReport {
    partialResultRefs: string[];
    unresolvedScope: string[];
    nextActions: string[];
    evidenceRefs: string[];
}
export interface StructuredFailureRecoveryInput {
    subjectPayload: unknown;
    diagnosis: LlmResultDiagnosisRecord;
    receipt: LlmDiagnosisReceipt | undefined;
    failureDiagnosis: FailureDiagnosis;
    recoveryCandidates: RecoveryCandidate[];
    selectedCandidateIndex?: number;
    constraintReviews: RecoveryCandidateConstraintReview[];
    retryCount: number;
    retryLimit: number;
    currentAttemptSignature: string;
    priorAttemptSignatures: string[];
    nextAttemptSignature?: string;
    stop?: RecoveryStopRecord;
    partialReport?: RecoveryPartialReport;
}
export interface StructuredFailureRecoveryDecision {
    state: "retry_ready" | "report_ready" | "stopped";
    outcome: "retry" | "redelegate" | "partial" | "completed" | "blocked";
    receiptId: string;
    selectedCandidate?: RecoveryCandidate;
    changedDimensions?: RecoveryChangedDimension[];
    nextAttemptSignature?: string;
    stopCondition?: RecoveryStopCondition;
    reason?: string;
    evidenceRefs: string[];
    partialResultRefs: string[];
    unresolvedScope: string[];
    userActions: string[];
    stateTrace: FailureRecoveryState[];
}
export declare function decideStructuredFailureRecovery(input: StructuredFailureRecoveryInput): StructuredFailureRecoveryDecision;
export declare function transitionFailureRecovery(state: FailureRecoveryState, event: FailureRecoveryEvent): FailureRecoveryState;
//# sourceMappingURL=failure-recovery-decision.d.ts.map