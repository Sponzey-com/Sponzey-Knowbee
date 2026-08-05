import type {
  ApprovedOperationContinuationExecutionAdapter,
  ApprovedOperationContinuationExecutionResult,
} from "../../runs/approved-operation-continuation-consumer.js"
import type { ApprovedOperationContinuation } from "../../runs/approved-operation-continuation.js"

export interface YeonjangCameraContinuationCandidate {
  readonly extensionId: string
  readonly targetSessionId?: string
  readonly deviceId?: string
  readonly requestedFacing?: "front" | "rear"
}

export function createYeonjangCameraContinuationAdapter(dependencies: {
  candidates: () => readonly YeonjangCameraContinuationCandidate[]
  projectOperation: (
    params: YeonjangCameraContinuationCandidate,
  ) => {
    readonly operationId: string
    readonly operationBindingHash: `sha256:${string}`
  }
  execute: (
    params: YeonjangCameraContinuationCandidate,
    continuation: ApprovedOperationContinuation,
    signal: AbortSignal,
  ) => Promise<ApprovedOperationContinuationExecutionResult>
}): ApprovedOperationContinuationExecutionAdapter {
  return Object.freeze({
    toolName: "yeonjang_camera_capture",
    async execute(input: {
      continuation: ApprovedOperationContinuation
      signal: AbortSignal
    }) {
      const { continuation, signal } = input
      const exact = dependencies.candidates().find((candidate) => {
        const projected = dependencies.projectOperation(candidate)
        return (
          projected.operationId === continuation.operationId
          && projected.operationBindingHash
            === continuation.operationBindingHash
        )
      })
      if (!exact) {
        return {
          status: "blocked" as const,
          reasonCode: "camera_continuation_binding_not_rehydratable",
        }
      }
      return dependencies.execute(exact, continuation, signal)
    },
  })
}
