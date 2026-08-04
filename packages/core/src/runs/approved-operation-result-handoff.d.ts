import type { ToolResult } from "../tools/types.js";
import type { ApprovedOperationContinuation } from "./approved-operation-continuation.js";
import type { RecoveredExecutionAttempt } from "./execution-cycle-pass.js";
export type ApprovedOperationResultHandoffResult = {
    readonly ok: true;
    readonly inserted: boolean;
} | {
    readonly ok: false;
    readonly reasonCode: string;
};
export type LoadRecoveredApprovedOperationAttemptResult = {
    readonly ok: true;
    readonly attempt: RecoveredExecutionAttempt;
} | {
    readonly ok: false;
    readonly reasonCode: string;
};
export declare function handoffApprovedOperationResult(input: {
    continuation: ApprovedOperationContinuation;
    toolUseId: string;
    result: ToolResult;
}): ApprovedOperationResultHandoffResult;
export declare function loadRecoveredApprovedOperationAttempt(runId: string): LoadRecoveredApprovedOperationAttemptResult;
//# sourceMappingURL=approved-operation-result-handoff.d.ts.map