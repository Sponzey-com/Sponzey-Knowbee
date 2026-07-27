import { startChannels } from "../channels/index.js"
import type { StartedChannelRecoveryRuntime } from "../channels/pending-response-delivery.js"
import type { RuntimePaths } from "../config/paths.js"
import type { KnowbeeConfig } from "../config/types.js"
import {
  type CanonicalPendingDeliveryHandlerResolver,
  recoverCanonicalPendingResponsesOnStartup,
} from "../runs/canonical-pending-response-recovery-runtime.js"

export interface PendingResponseRecoverySummary {
  recovered: number
  failed: number
  skipped: number
}

export interface ChannelActivationRecoveryResult {
  channelRuntime: StartedChannelRecoveryRuntime
  recovery: PendingResponseRecoverySummary
}

interface PendingResponseRecoveryOptions {
  resolveDeliveryHandler: CanonicalPendingDeliveryHandlerResolver
}

export interface ChannelActivationRecoveryDependencies {
  startChannels(config: KnowbeeConfig, paths: RuntimePaths): Promise<StartedChannelRecoveryRuntime>
  recoverPendingResponses(
    options: PendingResponseRecoveryOptions,
  ): Promise<PendingResponseRecoverySummary>
}

export interface ChannelRuntimeRecoveryDependencies {
  recoverPendingResponses(
    options: PendingResponseRecoveryOptions,
  ): Promise<PendingResponseRecoverySummary>
}

const defaultRecoveryDependencies: ChannelRuntimeRecoveryDependencies = Object.freeze({
  recoverPendingResponses: recoverCanonicalPendingResponsesOnStartup,
})

const defaultActivationDependencies: ChannelActivationRecoveryDependencies = Object.freeze({
  startChannels,
  ...defaultRecoveryDependencies,
})

export async function recoverPendingResponsesForChannelRuntime(
  channelRuntime: StartedChannelRecoveryRuntime,
  dependencies: ChannelRuntimeRecoveryDependencies = defaultRecoveryDependencies,
): Promise<PendingResponseRecoverySummary> {
  return dependencies.recoverPendingResponses({
    resolveDeliveryHandler: channelRuntime.resolveDeliveryHandler,
  })
}

export async function activateChannelsAndRecoverPendingResponses(
  config: KnowbeeConfig,
  paths: RuntimePaths,
  dependencies: ChannelActivationRecoveryDependencies = defaultActivationDependencies,
): Promise<ChannelActivationRecoveryResult> {
  const channelRuntime = await dependencies.startChannels(config, paths)
  const recovery = await recoverPendingResponsesForChannelRuntime(channelRuntime, dependencies)
  return Object.freeze({ channelRuntime, recovery })
}
