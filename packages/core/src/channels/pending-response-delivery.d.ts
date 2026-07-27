import type { CanonicalPendingDeliveryHandlerResolver } from "../runs/canonical-pending-response-recovery-runtime.js";
import type { RunChunkDeliveryHandler } from "../runs/delivery.js";
export interface ChannelPendingResponseDeliveryInput {
    runId: string;
    sessionId: string;
    language?: "ko" | "en";
}
export interface ChannelPendingResponseDeliveryOwner {
    createPendingResponseDeliveryHandler(input: ChannelPendingResponseDeliveryInput): RunChunkDeliveryHandler;
}
export interface StartedChannelRecoveryRuntime {
    resolveDeliveryHandler: CanonicalPendingDeliveryHandlerResolver;
}
export declare function createStartedChannelRecoveryRuntime(input: {
    telegram?: ChannelPendingResponseDeliveryOwner;
    slack?: ChannelPendingResponseDeliveryOwner;
}): StartedChannelRecoveryRuntime;
//# sourceMappingURL=pending-response-delivery.d.ts.map