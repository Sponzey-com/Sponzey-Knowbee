import { type ChildWorkResult, type WorkHandoffPackage, type WorkRecord } from "./work-record.js";
export type DelegationBenefitKind = "specialty" | "parallelism" | "independent_review" | "verification" | "workflow_decomposition";
export interface DelegationBenefitEvidence {
    kind: DelegationBenefitKind;
    evidenceRefs: string[];
}
export interface EvidenceBasedDelegationDecision {
    outcome: "delegate" | "keep_local" | "rejected";
    reasonCode: string;
    benefitKinds: DelegationBenefitKind[];
    targetAgentName: string;
}
export interface EvidenceBasedDelegationInput {
    parentAgentName: string;
    targetAgentName: string;
    availableAgentCount: number;
    targetActive: boolean;
    targetIsDirectChild: boolean;
    baseEligibility: {
        state: "eligible" | "rejected";
        reasonCodes: string[];
    };
    targetCapabilityEvidenceRefs: string[];
    benefits: DelegationBenefitEvidence[];
    localExecutionCost: number;
    delegationCost: number;
    localCapabilityUnavailable: boolean;
}
export declare function decideEvidenceBasedDelegation(input: EvidenceBasedDelegationInput): EvidenceBasedDelegationDecision;
export declare function createStructuredDelegationHandoff(input: {
    decision: EvidenceBasedDelegationDecision;
    parentRecord: WorkRecord;
    parentStepId: string;
    childWorkId: string;
    handoffId: string;
    explicitContextRefs: string[];
    allowedTools: string[];
    disallowedActions: string[];
    validationMethod: string;
    failureRecoveryPolicy: string;
    deadlineOrBudget: string;
}): WorkHandoffPackage;
export interface StructuredDelegationRoundTripResult {
    ok: true;
    parentWorkId: string;
    childWorkId: string;
    parentStepId: string;
    targetAgentName: string;
    evidenceRefs: string[];
}
export type StructuredChildResultMergeFailureReason = "invalid_parent_record" | "invalid_handoff" | "invalid_child_result" | "linkage_mismatch" | "duplicate_child_result" | "invalid_merged_record";
export type StructuredChildResultMergeResult = {
    ok: true;
    record: WorkRecord;
    parentWorkId: string;
    childWorkId: string;
    parentStepId: string;
    requiresParentReview: true;
} | {
    ok: false;
    reasonCode: StructuredChildResultMergeFailureReason;
    issues: Array<{
        path: string;
        message: string;
    }>;
};
export declare function mergeStructuredChildResultIntoParent(input: {
    parentRecord: WorkRecord;
    handoff: WorkHandoffPackage;
    childResult: ChildWorkResult;
    mergedAt: number;
}): StructuredChildResultMergeResult;
export declare function validateStructuredDelegationRoundTrip(input: {
    parentRecord: WorkRecord;
    handoff: WorkHandoffPackage;
    childResult: ChildWorkResult;
}): StructuredDelegationRoundTripResult;
//# sourceMappingURL=evidence-delegation.d.ts.map