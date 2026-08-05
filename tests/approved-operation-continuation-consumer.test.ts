import { describe, expect, it, vi } from "vitest"
import {
  consumeApprovedOperationContinuation,
} from "../packages/core/src/runs/approved-operation-continuation-consumer.ts"
import {
  createYeonjangCameraContinuationAdapter,
} from "../packages/core/src/tools/builtin/yeonjang-camera-continuation.ts"
import {
  createTelegramSendContinuationAdapter,
} from "../packages/core/src/tools/builtin/telegram-send-continuation.ts"
import type {
  ApprovedOperationContinuation,
  ApprovedOperationContinuationRepository,
} from "../packages/core/src/runs/approved-operation-continuation.ts"
import type { ToolResult } from "../packages/core/src/tools/types.ts"

function continuation(): ApprovedOperationContinuation {
  return {
    continuationId: "approval-continuation:approval:camera:1",
    approvalId: "approval:camera:1",
    runId: "run:camera:1",
    requestGroupId: "group:camera:1",
    toolName: "yeonjang_camera_capture",
    decision: "allow_once",
    operationId: "operation:camera:exact",
    operationBindingHash: `sha256:${"a".repeat(64)}`,
    schemaVersion: 1,
    status: "claimed",
    claimOwnerId: "restart-consumer",
    claimExpiresAt: 200,
    createdAt: 100,
    updatedAt: 110,
    completedAt: null,
  }
}

describe("approved operation continuation consumer", () => {
  it("cancels an already-aborted continuation without dispatching its adapter", async () => {
    const controller = new AbortController()
    controller.abort()
    const execute = vi.fn()
    const cancel = vi.fn(() => ({
      status: "cancelled" as const,
      continuation: { ...continuation(), status: "cancelled" as const },
    }))

    await expect(consumeApprovedOperationContinuation({
      continuation: continuation(),
      ownerId: "restart-consumer",
      signal: controller.signal,
    }, {
      repository: {
        cancel,
        complete: vi.fn(),
        fail: vi.fn(),
      } as unknown as ApprovedOperationContinuationRepository,
      adapters: [{
        toolName: "yeonjang_camera_capture",
        execute,
      }],
      handoffCompletedResult: vi.fn(),
    })).resolves.toEqual({
      status: "cancelled",
      reasonCode: "approval_continuation_cancelled_before_execution",
      toolName: "yeonjang_camera_capture",
    })
    expect(execute).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("persists an adapter cancellation without converting it to failure", async () => {
    const cancel = vi.fn(() => ({
      status: "cancelled" as const,
      continuation: { ...continuation(), status: "cancelled" as const },
    }))
    const fail = vi.fn()

    await expect(consumeApprovedOperationContinuation({
      continuation: continuation(),
      ownerId: "restart-consumer",
      signal: new AbortController().signal,
    }, {
      repository: {
        cancel,
        complete: vi.fn(),
        fail,
      } as unknown as ApprovedOperationContinuationRepository,
      adapters: [{
        toolName: "yeonjang_camera_capture",
        execute: async () => ({
          status: "cancelled",
          reasonCode: "user_cancelled",
        }),
      }],
      handoffCompletedResult: vi.fn(),
    })).resolves.toEqual({
      status: "cancelled",
      reasonCode: "user_cancelled",
      toolName: "yeonjang_camera_capture",
    })

    expect(cancel).toHaveBeenCalledOnce()
    expect(fail).not.toHaveBeenCalled()
  })

  it("rehydrates one exact camera candidate without a model call or new approval", async () => {
    const toolResult: ToolResult = {
      success: true,
      output: "captured",
      details: {
        artifactVerification: {
          status: "verified",
          artifactRef: "artifact:camera:1",
          mimeType: "image/jpeg",
          sizeBytes: 123,
        },
      },
    }
    const execute = vi.fn(async () => ({
      status: "completed" as const,
      toolUseId: "tool-use:camera:1",
      result: toolResult,
    }))
    const adapter = createYeonjangCameraContinuationAdapter({
      candidates: () => [
        { extensionId: "wrong-camera" },
        { extensionId: "yeonjang-main" },
      ],
      projectOperation: (params) => params.extensionId === "yeonjang-main"
        ? {
            operationId: "operation:camera:exact",
            operationBindingHash: `sha256:${"a".repeat(64)}` as const,
          }
        : {
            operationId: "operation:camera:other",
            operationBindingHash: `sha256:${"b".repeat(64)}` as const,
          },
      execute,
    })
    const complete = vi.fn(() => ({
      status: "completed" as const,
      continuation: { ...continuation(), status: "completed" as const },
    }))
    const repository = {
      complete,
      fail: vi.fn(),
    } as unknown as ApprovedOperationContinuationRepository
    const handoffCompletedResult = vi.fn(async () => ({ ok: true as const }))

    await expect(consumeApprovedOperationContinuation({
      continuation: continuation(),
      ownerId: "restart-consumer",
      signal: new AbortController().signal,
    }, {
      repository,
      adapters: [adapter],
      handoffCompletedResult,
    })).resolves.toMatchObject({
      status: "completed",
      toolName: "yeonjang_camera_capture",
    })
    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(
      { extensionId: "yeonjang-main" },
      expect.objectContaining({
        operationId: "operation:camera:exact",
      }),
      expect.any(AbortSignal),
    )
    expect(handoffCompletedResult).toHaveBeenCalledWith({
      continuation: expect.objectContaining({
        continuationId: "approval-continuation:approval:camera:1",
      }),
      toolUseId: "tool-use:camera:1",
      result: toolResult,
    })
    expect(complete).toHaveBeenCalledOnce()
  })

  it("does not settle a continuation when its exact tool result cannot be handed off", async () => {
    const adapter = createYeonjangCameraContinuationAdapter({
      candidates: () => [{ extensionId: "yeonjang-main" }],
      projectOperation: () => ({
        operationId: "operation:camera:exact",
        operationBindingHash: `sha256:${"a".repeat(64)}`,
      }),
      execute: async () => ({
        status: "completed",
        toolUseId: "tool-use:camera:1",
        result: { success: true, output: "captured" },
      }),
    })
    const complete = vi.fn()
    const fail = vi.fn(() => ({
      status: "failed" as const,
      continuation: { ...continuation(), status: "failed" as const },
    }))

    await expect(consumeApprovedOperationContinuation({
      continuation: continuation(),
      ownerId: "restart-consumer",
      signal: new AbortController().signal,
    }, {
      repository: { complete, fail } as unknown as ApprovedOperationContinuationRepository,
      adapters: [adapter],
      handoffCompletedResult: async () => ({
        ok: false,
        reasonCode: "approval_continuation_tool_result_handoff_failed",
      }),
    })).resolves.toEqual({
      status: "blocked",
      reasonCode: "approval_continuation_tool_result_handoff_failed",
      toolName: "yeonjang_camera_capture",
    })
    expect(complete).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledOnce()
  })

  it("fails closed when no camera candidate reproduces the durable binding", async () => {
    const execute = vi.fn()
    const adapter = createYeonjangCameraContinuationAdapter({
      candidates: () => [{ extensionId: "different-camera" }],
      projectOperation: () => ({
        operationId: "operation:camera:other",
        operationBindingHash: `sha256:${"b".repeat(64)}`,
      }),
      execute,
    })
    const fail = vi.fn(() => ({
      status: "failed" as const,
      continuation: { ...continuation(), status: "failed" as const },
    }))

    await expect(consumeApprovedOperationContinuation({
      continuation: continuation(),
      ownerId: "restart-consumer",
      signal: new AbortController().signal,
    }, {
      repository: { fail } as unknown as ApprovedOperationContinuationRepository,
      adapters: [adapter],
      handoffCompletedResult: async () => ({ ok: true }),
    })).resolves.toEqual({
      status: "blocked",
      reasonCode: "camera_continuation_binding_not_rehydratable",
      toolName: "yeonjang_camera_capture",
    })
    expect(execute).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledOnce()
  })

  it("resumes only the Telegram artifact candidate with the exact durable target binding", async () => {
    const deliveryContinuation: ApprovedOperationContinuation = {
      ...continuation(),
      continuationId: "approval-continuation:approval:delivery:1",
      approvalId: "approval:delivery:1",
      toolName: "telegram_send_file",
      operationId: "operation:delivery:chat-a:artifact-a",
      operationBindingHash: `sha256:${"c".repeat(64)}`,
    }
    const execute = vi.fn(async (candidate) => ({
      status: "completed" as const,
      toolUseId: candidate.toolUseId,
      result: {
        success: true,
        output: "delivered",
        details: {
          kind: "artifact_delivery",
          channel: "telegram",
          artifactRef: candidate.artifactRef,
          size: 123,
          source: "telegram",
        },
      },
    }))
    const adapter = createTelegramSendContinuationAdapter({
      candidates: () => [
        {
          toolUseId: "tool-use:wrong-chat",
          artifactRef: "artifact:wrong-chat",
        },
        {
          toolUseId: "tool-use:exact",
          artifactRef: "artifact:exact",
        },
      ],
      projectOperation: (candidate) => candidate.toolUseId === "tool-use:exact"
        ? {
            operationId: "operation:delivery:chat-a:artifact-a",
            operationBindingHash: `sha256:${"c".repeat(64)}`,
          }
        : {
            operationId: "operation:delivery:chat-b:artifact-a",
            operationBindingHash: `sha256:${"d".repeat(64)}`,
          },
      execute,
    })
    const complete = vi.fn(() => ({
      status: "completed" as const,
      continuation: {
        ...deliveryContinuation,
        status: "completed" as const,
      },
    }))

    await expect(consumeApprovedOperationContinuation({
      continuation: deliveryContinuation,
      ownerId: "restart-consumer",
      signal: new AbortController().signal,
    }, {
      repository: {
        complete,
        fail: vi.fn(),
      } as unknown as ApprovedOperationContinuationRepository,
      adapters: [adapter],
      handoffCompletedResult: async () => ({ ok: true }),
    })).resolves.toMatchObject({
      status: "completed",
      toolName: "telegram_send_file",
    })
    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ toolUseId: "tool-use:exact" }),
      expect.objectContaining({ approvalId: "approval:delivery:1" }),
      expect.any(AbortSignal),
    )
  })
})
