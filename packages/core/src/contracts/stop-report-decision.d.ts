export type AttemptLimitPolicy = {
    kind: "bounded";
    maxTurns: number;
    maxRetries: number;
    policyVersion: string;
} | {
    kind: "unbounded";
    policyVersion: string;
} | {
    kind: "strategy_guarded";
    policyVersion: string;
};
export declare function normalizeStartupAttemptLimitPolicy(input: {
    maxTurns: number;
    maxRetries?: number;
    policyVersion: string;
}): AttemptLimitPolicy;
export interface GoalCompletionReceipt {
    goalId: string;
    expectedCriterionIds: string[];
    satisfiedCriterionIds: string[];
    evidenceRefsByCriterion: Record<string, string[]>;
    unresolvedItemIds: string[];
}
export interface StopReportInput {
    goalId: string;
    reasonCode: "goal_achieved" | "turn_limit_reached" | "retry_limit_reached";
    evidenceRefs: string[];
    unresolvedItemIds: string[];
    currentTurn: number;
    currentRetry: number;
    policyVersion: string;
}
export type StopReportDecision = {
    status: "continue";
    nextTurn: number;
} | {
    status: "reassess_strategy";
    event: "REASSESS_STRATEGY";
    reasonCode: "turn_observation_threshold_reached" | "retry_observation_threshold_reached";
    currentTurn: number;
    currentRetry: number;
    nextTurn: number;
    policyVersion: string;
} | {
    status: "blocked_pending_input";
    reasonCode: "completion_evidence_incomplete";
    missingCriterionIds: string[];
} | {
    status: "stop_and_report";
    reasonCode: StopReportInput["reasonCode"];
    reportInput: StopReportInput;
};
export interface PermissionDenialReceipt {
    permissionKind: string;
    targetRef: string;
    decisionSource: "user" | "policy" | "operating_system";
    evidenceRefs: string[];
    safeAlternativePathIds: string[];
}
export interface ConcreteImpossibilityReceipt {
    reasonCode: string;
    verifiedFacts: string[];
    evidenceRefs: string[];
    recoverable: boolean;
    requiredChanges: string[];
}
export interface ExhaustedSolutionPathReceipt {
    receiptId: string;
    complete: boolean;
    canFinalizeFailure: boolean;
    missingPaths: string[];
    evidenceRefs: string[];
    partialResultRefs: string[];
    workaroundGuidance: string[];
}
export interface BlockedStopReportInput {
    goalId: string;
    reasonCode: "permission_denied" | "solution_paths_exhausted" | "concrete_impossibility";
    diagnosisReceiptId: string;
    evidenceRefs: string[];
    unresolvedItemIds: string[];
    partialResultRefs: string[];
    nextActions: string[];
}
export type BlockedStopReportDecision = {
    status: "continue";
    reasonCode: "solution_paths_remaining";
    remainingPathIds: string[];
} | {
    status: "blocked_pending_input";
    reasonCode: "recoverable_condition";
    requiredChanges: string[];
} | {
    status: "stop_and_report";
    reasonCode: BlockedStopReportInput["reasonCode"];
    reportInput: BlockedStopReportInput;
};
export declare function evaluateBlockedStopReportDecision(input: {
    goalId: string;
    exhaustion: ExhaustedSolutionPathReceipt;
    unresolvedItemIds: string[];
    permissionDenial?: PermissionDenialReceipt;
    impossibility?: ConcreteImpossibilityReceipt;
}): BlockedStopReportDecision;
export declare function evaluateStopReportDecision(input: {
    completion: GoalCompletionReceipt;
    attempts: {
        currentTurn: number;
        currentRetry: number;
    };
    policy: AttemptLimitPolicy;
}): StopReportDecision;
export declare function executeContinuingAction<T>(input: {
    decision: StopReportDecision | BlockedStopReportDecision;
    execute: () => Promise<T>;
}): Promise<{
    status: "executed";
    result: T;
} | Exclude<StopReportDecision | BlockedStopReportDecision, {
    status: "continue";
}>>;
//# sourceMappingURL=stop-report-decision.d.ts.map