import type { SafetyRiskDecision } from "../contracts/safety-control-self-solve.js";
export type AppliedSafetyRiskDecision<T> = {
    status: "executed";
    result: T;
} | {
    status: "blocked_pending_input";
    requiredActions: string[];
} | {
    status: "stopped";
    reasonCode: "safety_risk";
    evidenceRefs: string[];
};
export declare function applySafetyRiskDecision<T>(input: {
    decision: SafetyRiskDecision;
    execute: () => Promise<T>;
    requestMitigationOrApproval: (requiredActions: string[]) => void | Promise<void>;
    stopRun: (input: {
        reasonCode: "safety_risk";
        evidenceRefs: string[];
    }) => void | Promise<void>;
}): Promise<AppliedSafetyRiskDecision<T>>;
//# sourceMappingURL=safety-risk-application.d.ts.map