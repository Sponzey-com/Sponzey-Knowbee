import type Database from "better-sqlite3";
import type { SideEffectOperationAggregate } from "../runs/side-effect-operation-use-case.js";
import type { SideEffectOperationReceipt } from "../contracts/side-effect-operation.js";
export type YeonjangSideEffectGoalValidationCandidateReasonCode = "operation_id_missing" | "operation_not_found" | "operation_run_scope_mismatch" | "operation_work_scope_mismatch" | "operation_not_manual";
export type YeonjangSideEffectGoalValidationCandidate = {
    status: "ready";
    operation: SideEffectOperationAggregate;
    loadReceipt: (receiptId: string) => SideEffectOperationReceipt | undefined;
    publicSummary: {
        operationId: string;
        runId: string;
        workId: string;
        adapterId: string;
        state: "MANUAL_INTERVENTION";
        revision: number;
        transitionCount: number;
    };
} | {
    status: "not_ready";
    reasonCode: YeonjangSideEffectGoalValidationCandidateReasonCode;
};
export declare function loadYeonjangSideEffectGoalValidationCandidate(input: {
    db: Database.Database;
    operationId: string;
    expectedRunId: string;
    expectedWorkId?: string;
    now?: () => number;
}): YeonjangSideEffectGoalValidationCandidate;
//# sourceMappingURL=side-effect-goal-validation-adapter.d.ts.map