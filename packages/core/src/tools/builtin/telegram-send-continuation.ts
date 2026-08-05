import type {
  ApprovedOperationContinuationExecutionAdapter,
  ApprovedOperationContinuationExecutionResult,
} from "../../runs/approved-operation-continuation-consumer.js"
import type {
  ApprovedOperationContinuation,
} from "../../runs/approved-operation-continuation.js"

export interface TelegramSendContinuationCandidate {
  readonly toolUseId: string
  readonly artifactRef: string
  readonly caption?: string | undefined
}

export function createTelegramSendContinuationAdapter(input: {
  candidates: () => readonly TelegramSendContinuationCandidate[]
  projectOperation(candidate: TelegramSendContinuationCandidate): {
    readonly operationId: string
    readonly operationBindingHash: `sha256:${string}`
  } | null
  execute(
    candidate: TelegramSendContinuationCandidate,
    continuation: ApprovedOperationContinuation,
    signal: AbortSignal,
  ): Promise<ApprovedOperationContinuationExecutionResult>
}): ApprovedOperationContinuationExecutionAdapter {
  const adapter: ApprovedOperationContinuationExecutionAdapter = {
    toolName: "telegram_send_file",
    async execute({
      continuation,
      signal,
    }: {
      continuation: ApprovedOperationContinuation
      signal: AbortSignal
    }): Promise<ApprovedOperationContinuationExecutionResult> {
      if (signal.aborted) {
        return {
          status: "cancelled",
          reasonCode: "approval_continuation_cancelled",
        }
      }
      const candidate = input.candidates().find((entry) => {
        const projected = input.projectOperation(entry)
        return (
          projected !== null
          && projected.operationId === continuation.operationId
          && projected.operationBindingHash
            === continuation.operationBindingHash
        )
      })
      if (!candidate) {
        return {
          status: "blocked" as const,
          reasonCode: "telegram_delivery_continuation_binding_not_rehydratable",
        }
      }
      return input.execute(candidate, continuation, signal)
    },
  }
  return Object.freeze(adapter)
}
