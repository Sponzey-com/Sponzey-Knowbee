import type { StartedChannelRecoveryRuntime } from "../channels/pending-response-delivery.js";
import type { RuntimePaths } from "../config/paths.js";
import type { KnowbeeConfig } from "../config/types.js";
import { type CanonicalPendingDeliveryHandlerResolver } from "../runs/canonical-pending-response-recovery-runtime.js";
export interface PendingResponseRecoverySummary {
    recovered: number;
    failed: number;
    skipped: number;
}
export interface ChannelActivationRecoveryResult {
    channelRuntime: StartedChannelRecoveryRuntime;
    recovery: PendingResponseRecoverySummary;
}
interface PendingResponseRecoveryOptions {
    resolveDeliveryHandler: CanonicalPendingDeliveryHandlerResolver;
}
export interface ChannelActivationRecoveryDependencies {
    startChannels(config: KnowbeeConfig, paths: RuntimePaths): Promise<StartedChannelRecoveryRuntime>;
    recoverPendingResponses(options: PendingResponseRecoveryOptions): Promise<PendingResponseRecoverySummary>;
}
export interface ChannelRuntimeRecoveryDependencies {
    recoverPendingResponses(options: PendingResponseRecoveryOptions): Promise<PendingResponseRecoverySummary>;
}
export declare function recoverPendingResponsesForChannelRuntime(channelRuntime: StartedChannelRecoveryRuntime, dependencies?: ChannelRuntimeRecoveryDependencies): Promise<PendingResponseRecoverySummary>;
export declare function activateChannelsAndRecoverPendingResponses(config: KnowbeeConfig, paths: RuntimePaths, dependencies?: ChannelActivationRecoveryDependencies): Promise<ChannelActivationRecoveryResult>;
export {};
//# sourceMappingURL=channel-activation-recovery.d.ts.map