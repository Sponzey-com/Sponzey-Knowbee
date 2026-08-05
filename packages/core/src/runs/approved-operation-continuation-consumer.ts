import type {
  ApprovedOperationContinuation,
  ApprovedOperationContinuationRepository,
} from "./approved-operation-continuation.js"
import type { ToolResult } from "../tools/types.js"

export type ApprovedOperationContinuationExecutionResult =
  | {
      readonly status: "completed"
      readonly toolUseId: string
      readonly result: ToolResult
    }
  | { readonly status: "blocked"; readonly reasonCode: string }
  | { readonly status: "cancelled"; readonly reasonCode: string }

export interface ApprovedOperationContinuationExecutionAdapter {
  readonly toolName: string
  execute(input: {
    continuation: ApprovedOperationContinuation
    signal: AbortSignal
  }): Promise<ApprovedOperationContinuationExecutionResult>
}

export type ConsumeApprovedOperationContinuationResult =
  | { readonly status: "completed"; readonly toolName: string }
  | {
      readonly status: "blocked" | "cancelled"
      readonly reasonCode: string
      readonly toolName: string
    }

export async function consumeApprovedOperationContinuation(
  input: {
    continuation: ApprovedOperationContinuation
    ownerId: string
    signal: AbortSignal
  },
  dependencies: {
    repository: ApprovedOperationContinuationRepository
    adapters: readonly ApprovedOperationContinuationExecutionAdapter[]
    handoffCompletedResult(input: {
      continuation: ApprovedOperationContinuation
      toolUseId: string
      result: ToolResult
    }): Promise<{ ok: true } | { ok: false; reasonCode: string }>
  },
): Promise<ConsumeApprovedOperationContinuationResult> {
  if (input.signal.aborted) {
    const settled = dependencies.repository.cancel({
      continuationId: input.continuation.continuationId,
      ownerId: input.ownerId,
    })
    return settled.status === "cancelled"
      ? {
          status: "cancelled",
          reasonCode: "approval_continuation_cancelled_before_execution",
          toolName: input.continuation.toolName,
        }
      : {
          status: "blocked",
          reasonCode: settled.reasonCode,
          toolName: input.continuation.toolName,
        }
  }

  const adapter = dependencies.adapters.find(
    (candidate) => candidate.toolName === input.continuation.toolName,
  )
  const execution = adapter
    ? await adapter.execute({
        continuation: input.continuation,
        signal: input.signal,
      })
    : {
        status: "blocked" as const,
        reasonCode: "approval_continuation_adapter_missing",
      }

  if (execution.status === "completed") {
    const handedOff = await dependencies.handoffCompletedResult({
      continuation: input.continuation,
      toolUseId: execution.toolUseId,
      result: execution.result,
    })
    if (!handedOff.ok) {
      const settled = dependencies.repository.fail({
        continuationId: input.continuation.continuationId,
        ownerId: input.ownerId,
      })
      return settled.status === "failed"
        ? {
            status: "blocked",
            reasonCode: handedOff.reasonCode,
            toolName: input.continuation.toolName,
          }
        : {
            status: "blocked",
            reasonCode: settled.reasonCode,
            toolName: input.continuation.toolName,
          }
    }
    const settled = dependencies.repository.complete({
      continuationId: input.continuation.continuationId,
      ownerId: input.ownerId,
    })
    return settled.status === "completed"
      ? { status: "completed", toolName: input.continuation.toolName }
      : {
          status: "blocked",
          reasonCode: settled.reasonCode,
          toolName: input.continuation.toolName,
        }
  }

  if (execution.status === "cancelled") {
    const settled = dependencies.repository.cancel({
      continuationId: input.continuation.continuationId,
      ownerId: input.ownerId,
    })
    return settled.status === "cancelled"
      ? {
          status: "cancelled",
          reasonCode: execution.reasonCode,
          toolName: input.continuation.toolName,
        }
      : {
          status: "blocked",
          reasonCode: settled.reasonCode,
          toolName: input.continuation.toolName,
        }
  }

  const settled = dependencies.repository.fail({
    continuationId: input.continuation.continuationId,
    ownerId: input.ownerId,
  })
  return settled.status === "failed"
    ? {
        status: execution.status,
        reasonCode: execution.reasonCode,
        toolName: input.continuation.toolName,
      }
    : {
        status: "blocked",
        reasonCode: settled.reasonCode,
        toolName: input.continuation.toolName,
      }
}
