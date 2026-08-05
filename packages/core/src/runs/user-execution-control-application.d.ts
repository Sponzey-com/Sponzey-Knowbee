import type { UserExecutionControlDecision } from "../contracts/safety-control-self-solve.js";
export type AppliedUserExecutionControl = {
    status: "ignored";
    reasonCode: "wrong_target" | "stale_or_duplicate";
} | {
    status: "cancelled";
    runId: string;
    commandId: string;
} | {
    status: "redirected";
    previousRunId: string;
    nextRunId: string;
    newGoalRef: string;
    commandId: string;
};
export declare function applyUserExecutionControl(input: {
    currentRunId: string;
    decision: UserExecutionControlDecision;
    cancelRun: (runId: string) => void | Promise<void>;
    startRedirectedRun: (input: {
        previousRunId: string;
        newGoalRef: string;
        commandId: string;
    }) => string | Promise<string>;
}): Promise<AppliedUserExecutionControl>;
//# sourceMappingURL=user-execution-control-application.d.ts.map