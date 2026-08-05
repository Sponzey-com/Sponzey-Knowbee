import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js";
import type { RunScope, RunStatus } from "./types.js";
export type RequestExecutionOutcomeStatus = "in_progress" | "awaiting_approval" | "awaiting_user" | "succeeded" | "partially_succeeded" | "blocked" | "exhausted" | "cancelled" | "internal_fault";
export type RequestDeliveryOutcomeStatus = "not_started" | "pending" | "delivered" | "failed";
export type RunFlowStatusTransitionDecision = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
};
export interface RunFlowIdentifiers {
    runId: string;
    sessionId: string;
    requestGroupId: string;
    lineageRootRunId: string;
    runScope: RunScope;
    parentRunId?: string;
    scheduleId?: string;
}
export interface RequestExecutionOutcome {
    executionStatus: RequestExecutionOutcomeStatus;
    deliveryStatus: RequestDeliveryOutcomeStatus;
}
export declare const TERMINAL_RUN_STATUSES: ["completed", "failed", "cancelled", "interrupted"];
export declare function isTerminalRunStatus(status: RunStatus): boolean;
export declare function canTransitionRunStatus(currentStatus: RunStatus, nextStatus: RunStatus): RunFlowStatusTransitionDecision;
export declare function resolveRunFlowIdentifiers(params: {
    runId: string;
    sessionId: string;
    requestGroupId?: string | undefined;
    lineageRootRunId?: string | undefined;
    parentRunId?: string | undefined;
    runScope?: RunScope | undefined;
    scheduleId?: string | undefined;
}): RunFlowIdentifiers;
export declare function projectRequestExecutionOutcome(input: {
    aggregate: CanonicalWorkAggregate;
    runStatus: RunStatus;
    deliveryStatus: RequestDeliveryOutcomeStatus;
}): RequestExecutionOutcome;
//# sourceMappingURL=flow-contract.d.ts.map