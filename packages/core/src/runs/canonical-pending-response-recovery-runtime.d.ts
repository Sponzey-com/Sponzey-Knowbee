import type { RunChunkDeliveryHandler } from "./delivery.js";
export interface CanonicalPendingDeliveryHandlerResolutionInput {
    runId: string;
    sessionId: string;
    source: string;
    language?: "ko" | "en";
}
export type CanonicalPendingDeliveryHandlerResolver = (input: CanonicalPendingDeliveryHandlerResolutionInput) => RunChunkDeliveryHandler;
export declare function recoverCanonicalPendingResponsesOnStartup(options?: {
    resolveDeliveryHandler?: CanonicalPendingDeliveryHandlerResolver;
}): Promise<{
    recovered: number;
    failed: number;
    skipped: number;
}>;
//# sourceMappingURL=canonical-pending-response-recovery-runtime.d.ts.map