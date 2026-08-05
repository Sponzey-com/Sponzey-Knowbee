import {
  startRootRun,
  type StartedRootRun,
  type StartRootRunParams,
} from "../runs/start.js"
import type {
  ConversationProbeResult,
  ConversationRunBinding,
  ConversationVerificationInput,
} from "./conversation-process-verification.js"

export interface StartRootRunConversationProbeDependencies {
  buildStartParams(
    input: ConversationVerificationInput,
  ): StartRootRunParams
  startRootRun?: ((params: StartRootRunParams) => StartedRootRun) | undefined
}

export function createStartRootRunConversationProbe(
  dependencies: Readonly<StartRootRunConversationProbeDependencies>,
): (
  input: ConversationVerificationInput,
  signal?: AbortSignal,
) => Promise<ConversationProbeResult<ConversationRunBinding>> {
  const start = dependencies.startRootRun ?? startRootRun
  return async (input, signal) => {
    if (signal?.aborted) {
      return {
        status: "cancelled",
        reasonCode: "conversation_probe_start_cancelled",
      }
    }
    try {
      const params = dependencies.buildStartParams(input)
      if (
        params.source !== input.channel
        || params.message !== input.userRequest
      ) {
        return {
          status: "failure",
          reasonCode: "conversation_probe_start_input_mismatch",
        }
      }
      const started = start(params)
      const requestGroupId = params.requestGroupId?.trim() || started.runId
      if (
        !started.runId.trim()
        || !started.sessionId.trim()
        || requestGroupId !== started.runId
      ) {
        return {
          status: "failure",
          reasonCode: "conversation_probe_start_binding_invalid",
        }
      }
      return {
        status: "success",
        value: Object.freeze({
          runId: started.runId,
          requestGroupId,
          sessionId: started.sessionId,
        }),
      }
    } catch {
      return {
        status: "failure",
        reasonCode: "conversation_probe_start_failed",
      }
    }
  }
}
