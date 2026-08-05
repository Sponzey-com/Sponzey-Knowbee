import type { RecoveryCandidate, StructuredFailureRecoveryDecision } from "../contracts/index.js";
export type AppliedFailureRecovery<T> = {
    status: "recovery_executed";
    outcome: "retry" | "redelegate";
    receiptId: string;
    attemptSignature: string;
    retryCount: number;
    result: T;
} | {
    status: "partial_reported";
    receiptId: string;
    result: T;
} | {
    status: "recovery_stopped";
    outcome: "completed" | "blocked";
    receiptId: string;
    result: T;
};
export declare function applyStructuredFailureRecoveryDecision<T>(input: {
    decision: StructuredFailureRecoveryDecision;
    retryCount: number;
    executeRecovery: (input: {
        action: RecoveryCandidate;
        attemptSignature: string;
        receiptId: string;
        retryCount: number;
    }) => Promise<T>;
    reportPartial: (input: {
        partialResultRefs: string[];
        unresolvedScope: string[];
        nextActions: string[];
        receiptId: string;
    }) => Promise<T>;
    stopRecovery: (input: {
        outcome: "completed" | "blocked";
        stopCondition: NonNullable<StructuredFailureRecoveryDecision["stopCondition"]>;
        reason: string;
        evidenceRefs: string[];
        partialResultRefs: string[];
        unresolvedScope: string[];
        userActions: string[];
        receiptId: string;
    }) => Promise<T>;
}): Promise<AppliedFailureRecovery<T>>;
//# sourceMappingURL=failure-recovery-application.d.ts.map