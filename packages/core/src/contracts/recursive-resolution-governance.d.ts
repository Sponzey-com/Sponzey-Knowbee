import { type ResolutionAttemptRecord } from "./recursive-resolution-admission.js";
export interface ResolutionCandidate {
    candidateId: string;
    meansId: string;
    inputRefs: string[];
    targetId: string;
    strategyFingerprint: string;
    goalCompletionProspect: "plausible" | "implausible";
    permissionStatus: "allowed" | "denied";
    connectionStatus: "connected" | "not_required" | "unavailable";
    policyStatus: "allowed" | "denied";
    capabilityConfirmed: boolean;
    executable: boolean;
    evidenceRefs: string[];
}
export type RecursiveContinuationDecision = {
    status: "continue";
    viableCandidateIds: string[];
} | {
    status: "reassess";
    reason: "no_viable_changed_candidate";
    scope: {
        kind: "current_runtime_snapshot";
        workId: string;
        evaluatedCandidateIds: string[];
    };
    excludedCandidates: Array<{
        candidateId: string;
        reasonCodes: CandidateExclusionReason[];
    }>;
} | {
    status: "rejected";
    reasonCodes: Array<"continuation_input_invalid" | "attempt_ledger_invalid" | "candidate_snapshot_invalid">;
};
export interface ResolutionResourceValues {
    wallTimeMs: number;
    modelTokens: number;
    externalCostMicros: number;
    executionTimeMs: number;
}
export type ResolutionResourceDimension = "wall_time" | "model_tokens" | "external_cost" | "execution_time";
export type ResolutionResourceDecision = {
    status: "continue";
    remaining: ResolutionResourceValues;
} | {
    status: "reassess";
    dimensions: ResolutionResourceDimension[];
} | {
    status: "user_decision_required";
    dimensions: ResolutionResourceDimension[];
} | {
    status: "rejected";
    reasonCodes: ["resource_snapshot_invalid"];
};
export type CandidateExclusionReason = "permission_denied" | "connection_unavailable" | "policy_denied" | "capability_unconfirmed" | "not_executable" | "goal_implausible" | "cycle_detected" | "unchanged_attempt";
export type ResourceReassessmentReceipt = {
    status: "reassess";
    dimensions: ResolutionResourceDimension[];
    currentEvidenceRefs: string[];
    changedCandidateIds: string[];
} | {
    status: "rejected";
    reasonCodes: Array<"resource_reassessment_not_required" | "current_evidence_missing" | "changed_candidate_missing">;
};
export interface ResolutionProgressSnapshot {
    attemptedStepIds: string[];
    completedStepIds: string[];
    unresolvedCriteria: string[];
    evidenceRefs: string[];
}
export interface ResourceIncreaseRequest {
    dimension: ResolutionResourceDimension;
    additionalAmount: number;
}
export type ResourceDecisionRequest = {
    status: "user_decision_required";
    workId: string;
    progress: ResolutionProgressSnapshot;
    requestedIncreases: ResourceIncreaseRequest[];
} | {
    status: "rejected";
    reasonCodes: Array<"resource_decision_not_required" | "progress_snapshot_invalid" | "resource_decision_not_exact" | "resource_increment_invalid">;
};
export type RequiredResourceUnavailableBlock = {
    status: "blocked";
    reasonCode: "required_resource_unavailable";
    workId: string;
    resourceId: string;
    evidenceRefs: string[];
    evaluatedCandidateIds: string[];
} | {
    status: "rejected";
    reasonCodes: Array<"resource_block_input_invalid" | "changed_candidate_remaining" | "resource_scope_mismatch" | "candidate_review_incomplete">;
};
export interface ResolutionCycle {
    failureCause: string;
    strategyFingerprint: string;
    attemptIds: string[];
}
export type ResolutionCycleDetection = {
    status: "no_cycle";
    cycles: [];
    blockedStrategyFingerprints: [];
} | {
    status: "cycle_detected";
    cycles: ResolutionCycle[];
    blockedStrategyFingerprints: string[];
} | {
    status: "rejected";
    reasonCodes: ["attempt_ledger_invalid"];
};
export declare function detectResolutionCycles(attempts: ResolutionAttemptRecord[]): ResolutionCycleDetection;
export declare function evaluateRecursiveContinuation(input: {
    workId: string;
    unresolvedGoal: string;
    retryCount: number;
    priorAttempts: ResolutionAttemptRecord[];
    candidates: ResolutionCandidate[];
}): RecursiveContinuationDecision;
export declare function evaluateResolutionResources(input: {
    consumed: ResolutionResourceValues;
    limits: ResolutionResourceValues;
    reassessAtRatio: number;
}): ResolutionResourceDecision;
export declare function bindResourceReassessment(input: {
    resourceDecision: ResolutionResourceDecision;
    continuationDecision: RecursiveContinuationDecision;
    currentEvidenceRefs: string[];
}): ResourceReassessmentReceipt;
export declare function buildResourceDecisionRequest(input: {
    workId: string;
    resourceDecision: ResolutionResourceDecision;
    progress: ResolutionProgressSnapshot;
    requestedIncreases: ResourceIncreaseRequest[];
}): ResourceDecisionRequest;
export declare function admitRequiredResourceUnavailableBlock(input: {
    workId: string;
    resourceId: string;
    capabilitySnapshotRef: string;
    resourceEvidenceRefs: string[];
    continuationDecision: RecursiveContinuationDecision;
}): RequiredResourceUnavailableBlock;
//# sourceMappingURL=recursive-resolution-governance.d.ts.map