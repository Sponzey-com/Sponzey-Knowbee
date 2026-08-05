import type { ApprovedOperationContinuation, ApprovedOperationContinuationRepository } from "./approved-operation-continuation.js";
import type { ToolResult } from "../tools/types.js";
export type ApprovedOperationContinuationExecutionResult = {
    readonly status: "completed";
    readonly toolUseId: string;
    readonly result: ToolResult;
} | {
    readonly status: "blocked";
    readonly reasonCode: string;
} | {
    readonly status: "cancelled";
    readonly reasonCode: string;
};
export interface ApprovedOperationContinuationExecutionAdapter {
    readonly toolName: string;
    execute(input: {
        continuation: ApprovedOperationContinuation;
        signal: AbortSignal;
    }): Promise<ApprovedOperationContinuationExecutionResult>;
}
export type ConsumeApprovedOperationContinuationResult = {
    readonly status: "completed";
    readonly toolName: string;
} | {
    readonly status: "blocked" | "cancelled";
    readonly reasonCode: string;
    readonly toolName: string;
};
export declare function consumeApprovedOperationContinuation(input: {
    continuation: ApprovedOperationContinuation;
    ownerId: string;
    signal: AbortSignal;
}, dependencies: {
    repository: ApprovedOperationContinuationRepository;
    adapters: readonly ApprovedOperationContinuationExecutionAdapter[];
    handoffCompletedResult(input: {
        continuation: ApprovedOperationContinuation;
        toolUseId: string;
        result: ToolResult;
    }): Promise<{
        ok: true;
    } | {
        ok: false;
        reasonCode: string;
    }>;
}): Promise<ConsumeApprovedOperationContinuationResult>;
//# sourceMappingURL=approved-operation-continuation-consumer.d.ts.map