import type { ApprovedOperationContinuationExecutionAdapter, ApprovedOperationContinuationExecutionResult } from "../../runs/approved-operation-continuation-consumer.js";
import type { ApprovedOperationContinuation } from "../../runs/approved-operation-continuation.js";
export interface TelegramSendContinuationCandidate {
    readonly toolUseId: string;
    readonly artifactRef: string;
    readonly caption?: string | undefined;
}
export declare function createTelegramSendContinuationAdapter(input: {
    candidates: () => readonly TelegramSendContinuationCandidate[];
    projectOperation(candidate: TelegramSendContinuationCandidate): {
        readonly operationId: string;
        readonly operationBindingHash: `sha256:${string}`;
    } | null;
    execute(candidate: TelegramSendContinuationCandidate, continuation: ApprovedOperationContinuation, signal: AbortSignal): Promise<ApprovedOperationContinuationExecutionResult>;
}): ApprovedOperationContinuationExecutionAdapter;
//# sourceMappingURL=telegram-send-continuation.d.ts.map