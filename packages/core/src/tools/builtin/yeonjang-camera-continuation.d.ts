import type { ApprovedOperationContinuationExecutionAdapter, ApprovedOperationContinuationExecutionResult } from "../../runs/approved-operation-continuation-consumer.js";
import type { ApprovedOperationContinuation } from "../../runs/approved-operation-continuation.js";
export interface YeonjangCameraContinuationCandidate {
    readonly extensionId: string;
    readonly targetSessionId?: string;
    readonly deviceId?: string;
    readonly requestedFacing?: "front" | "rear";
}
export declare function createYeonjangCameraContinuationAdapter(dependencies: {
    candidates: () => readonly YeonjangCameraContinuationCandidate[];
    projectOperation: (params: YeonjangCameraContinuationCandidate) => {
        readonly operationId: string;
        readonly operationBindingHash: `sha256:${string}`;
    };
    execute: (params: YeonjangCameraContinuationCandidate, continuation: ApprovedOperationContinuation, signal: AbortSignal) => Promise<ApprovedOperationContinuationExecutionResult>;
}): ApprovedOperationContinuationExecutionAdapter;
//# sourceMappingURL=yeonjang-camera-continuation.d.ts.map