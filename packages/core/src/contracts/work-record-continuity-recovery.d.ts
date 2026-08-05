import { type StructuredChildResultMergeFailureReason } from "./evidence-delegation.js";
import { type ChildWorkResult, type RecoveryCandidate, type WorkHandoffPackage, type WorkRecord, type WorkRecordStatus } from "./work-record.js";
export interface WorkRecordContinuityRecoveryInput {
    parentRecord: WorkRecord;
    handoff: WorkHandoffPackage;
    childResult: ChildWorkResult;
    targetParentStatus: WorkRecordStatus;
    selectedRecoveryAction?: RecoveryCandidate;
    mergedAt: number;
    previousRecoverySignatures: string[];
}
export type WorkRecordContinuityRecoveryRejectionReason = StructuredChildResultMergeFailureReason | "transition_not_allowed" | "invalid_structured_record" | "recovery_action_required" | "recovery_action_invalid" | "recovery_signature_repeated" | "recovery_reentry_rejected";
export type WorkRecordContinuityRecoveryAcceptance = {
    status: "accepted";
    parentWorkId: string;
    childWorkId: string;
    parentStepId: string;
    targetAgentName: string;
    transition: {
        fromStatus: WorkRecordStatus;
        toStatus: WorkRecordStatus;
    };
    evidenceRefs: string[];
    recovery: null | {
        action: RecoveryCandidate["action_type"];
        targetStatus: "planned";
        signature: string;
        changedDimensions: RecoveryCandidate["changed_dimensions"];
    };
    record: WorkRecord;
} | {
    status: "rejected";
    reasonCode: WorkRecordContinuityRecoveryRejectionReason;
    issuePaths: string[];
};
export declare function createWorkRecoverySignature(candidate: RecoveryCandidate): string;
export declare function decideWorkRecordContinuityRecoveryAcceptance(input: WorkRecordContinuityRecoveryInput): WorkRecordContinuityRecoveryAcceptance;
//# sourceMappingURL=work-record-continuity-recovery.d.ts.map