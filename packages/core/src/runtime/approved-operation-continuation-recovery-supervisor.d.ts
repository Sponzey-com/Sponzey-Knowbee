import type { ApprovedOperationContinuationRecoverySummary } from "./approved-operation-continuation-recovery.js";
export interface ApprovedOperationContinuationRecoverySupervisor {
    wake(): Promise<void>;
    stop(): Promise<void>;
}
export declare function createApprovedOperationContinuationRecoverySupervisor(input: {
    recover(signal: AbortSignal): Promise<ApprovedOperationContinuationRecoverySummary>;
    onSummary?(summary: ApprovedOperationContinuationRecoverySummary, signal: AbortSignal): void | Promise<void>;
    onError?(): void;
}): ApprovedOperationContinuationRecoverySupervisor;
//# sourceMappingURL=approved-operation-continuation-recovery-supervisor.d.ts.map