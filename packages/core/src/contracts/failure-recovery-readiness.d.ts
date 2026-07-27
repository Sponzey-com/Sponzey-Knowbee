import type { StructuredFailureRecoveryDecision } from "./failure-recovery-decision.js";
import type { CapabilitySelectionBinding, LlmCapabilitySelectionAdmission } from "./llm-capability-selection.js";
import { type WorkRecord } from "./work-record.js";
export interface FailureRecoveryReadinessDiagnosis {
    workId: string;
    unsatisfiedStepIds: string[];
    obtainedResultStepIds: string[];
    obtainedEvidenceRefs: string[];
}
export type FailureRecoveryReadinessReasonCode = "work_record_invalid" | "work_scope_mismatch" | "unsatisfied_steps_mismatch" | "obtained_results_mismatch" | "obtained_evidence_mismatch" | "recovery_decision_not_ready" | "recovery_scope_mismatch" | "next_action_not_executable" | "next_action_binding_mismatch" | "recovery_cancelled";
export type FailureRecoveryReadiness = {
    status: "ready";
    workId: string;
    unsatisfiedStepIds: string[];
    obtainedResultStepIds: string[];
    obtainedEvidenceRefs: string[];
    recoveryReceiptId: string;
    capabilityReceiptId: string;
    selectedBinding: CapabilitySelectionBinding;
} | {
    status: "rejected";
    reasonCodes: FailureRecoveryReadinessReasonCode[];
};
export declare function decideFailureRecoveryReadiness(input: {
    workId: string;
    workRecord: WorkRecord;
    diagnosis: FailureRecoveryReadinessDiagnosis;
    recoveryDecision: StructuredFailureRecoveryDecision;
    capabilityAdmission: LlmCapabilitySelectionAdmission;
    cancellationRequested: boolean;
}): FailureRecoveryReadiness;
//# sourceMappingURL=failure-recovery-readiness.d.ts.map