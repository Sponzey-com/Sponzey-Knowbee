export type SafetySeverity = "low" | "medium" | "high" | "critical";
export interface SafetyRiskReceipt {
    riskKind: string;
    severity: SafetySeverity;
    affectedActionRef: string;
    evidenceRefs: string[];
    mitigationAvailable: boolean;
    approvalEligible: boolean;
    requiredMitigations: string[];
}
export type SafetyRiskDecision = {
    status: "continue";
    reasonCode: "risk_below_stop_threshold";
} | {
    status: "blocked_pending_input";
    reasonCode: "mitigation_or_approval_required";
    requiredActions: string[];
} | {
    status: "stop_and_report";
    reasonCode: "safety_risk";
    evidenceRefs: string[];
};
export interface UserExecutionControlReceipt {
    commandId: string;
    command: "cancel" | "redirect";
    targetRunId: string;
    currentRunId: string;
    actorRef: string;
    sequence: number;
    lastAppliedSequence: number;
    newGoalRef?: string;
}
export type UserExecutionControlDecision = {
    status: "ignored";
    reasonCode: "wrong_target" | "stale_or_duplicate";
} | {
    status: "cancelled";
    reasonCode: "user_cancelled";
    commandId: string;
} | {
    status: "redirected";
    reasonCode: "user_redirected";
    commandId: string;
    newGoalRef: string;
};
export interface SelfSolvePathReceipt {
    path: "direct_answer" | "plan";
    outcome: "available" | "attempted_failed" | "reviewed_unavailable";
    reasonCode: string;
    evidenceRefs: string[];
}
export type SelfSolveBeforeStopDecision = {
    status: "continue";
    reasonCode: "self_solve_available";
    path: SelfSolvePathReceipt["path"];
} | {
    status: "eligible_for_exhaustion";
    reasonCode: "self_solve_exhausted";
    evidenceRefs: string[];
};
export declare function evaluateSafetyRisk(receipt: SafetyRiskReceipt): SafetyRiskDecision;
export declare function evaluateUserExecutionControl(receipt: UserExecutionControlReceipt): UserExecutionControlDecision;
export declare function evaluateSelfSolveBeforeStop(reviews: readonly SelfSolvePathReceipt[]): SelfSolveBeforeStopDecision;
export declare function executeAfterControlDecision<T>(input: {
    decision: SafetyRiskDecision | UserExecutionControlDecision | SelfSolveBeforeStopDecision;
    execute: () => Promise<T>;
}): Promise<{
    status: "executed";
    result: T;
} | Exclude<typeof input.decision, {
    status: "continue";
}>>;
//# sourceMappingURL=safety-control-self-solve.d.ts.map