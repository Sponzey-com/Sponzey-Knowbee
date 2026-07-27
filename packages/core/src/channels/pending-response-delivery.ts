import type {
  CanonicalPendingDeliveryHandlerResolutionInput,
  CanonicalPendingDeliveryHandlerResolver,
} from "../runs/canonical-pending-response-recovery-runtime.js"
import type { RunChunkDeliveryHandler } from "../runs/delivery.js"

export interface ChannelPendingResponseDeliveryInput {
  runId: string
  sessionId: string
  language?: "ko" | "en"
}

export interface ChannelPendingResponseDeliveryOwner {
  createPendingResponseDeliveryHandler(
    input: ChannelPendingResponseDeliveryInput,
  ): RunChunkDeliveryHandler
}

export interface StartedChannelRecoveryRuntime {
  resolveDeliveryHandler: CanonicalPendingDeliveryHandlerResolver
}

export function createStartedChannelRecoveryRuntime(input: {
  telegram?: ChannelPendingResponseDeliveryOwner
  slack?: ChannelPendingResponseDeliveryOwner
}): StartedChannelRecoveryRuntime {
  const resolveDeliveryHandler = (
    resolution: CanonicalPendingDeliveryHandlerResolutionInput,
  ): RunChunkDeliveryHandler => {
    const deliveryInput: ChannelPendingResponseDeliveryInput = {
      runId: resolution.runId,
      sessionId: resolution.sessionId,
      ...(resolution.language ? { language: resolution.language } : {}),
    }
    if (resolution.source === "telegram") {
      return input.telegram?.createPendingResponseDeliveryHandler(deliveryInput)
    }
    if (resolution.source === "slack") {
      return input.slack?.createPendingResponseDeliveryHandler(deliveryInput)
    }
    return undefined
  }

  return Object.freeze({ resolveDeliveryHandler })
}
