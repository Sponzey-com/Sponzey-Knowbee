import type { RuntimePaths } from "../config/paths.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { CanonicalPendingDeliveryHandlerResolver } from "../runs/canonical-pending-response-recovery-runtime.js";
export interface ApprovedOperationContinuationRecoverySummary {
    readonly claimed: number;
    readonly completed: number;
    readonly blocked: number;
    readonly cancelled: boolean;
    readonly completedRunIds: readonly string[];
}
export declare function recoverApprovedOperationContinuations(input: {
    config: KnowbeeConfig;
    paths: RuntimePaths;
    signal: AbortSignal;
    ownerId?: string;
    resolveDeliveryHandler?: CanonicalPendingDeliveryHandlerResolver;
}): Promise<ApprovedOperationContinuationRecoverySummary>;
//# sourceMappingURL=approved-operation-continuation-recovery.d.ts.map