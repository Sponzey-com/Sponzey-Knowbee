import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTelegramChunkDeliveryHandler } from "../packages/core/src/channels/telegram/chunk-delivery.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { resetArtifactDeliveryDedupeForTest } from "../packages/core/src/runs/delivery.js"
import { createTestArtifactStorage } from "./fixtures/artifact-storage.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

const tempDirs: string[] = []
let artifactStorage: ReturnType<typeof createTestArtifactStorage>

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-telegram-chunk-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  artifactStorage = createTestArtifactStorage(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  resetArtifactDeliveryDedupeForTest()
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("telegram chunk delivery helper", () => {
  it("buffers reviewed text and returns text delivery receipt on done", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockResolvedValue([101, 102]),
      sendError: vi.fn(),
    }
    const recordOutgoingMessageRef = vi.fn()
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-1",
      recordOutgoingMessageRef,
      logError: vi.fn(),
    })

    await onChunk?.({ type: "text", delta: "안녕", textSource: "llm_reviewed" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(responder.sendFinalResponse).toHaveBeenCalledWith("안녕")
    expect(receipt).toMatchObject({
      textDeliveries: [{
        channel: "telegram",
        text: "안녕",
        messageIds: [101, 102],
        deliveryReceipts: [
          expect.objectContaining({
            status: "sent",
            messageId: "101",
            idempotencyKey: "telegram:final:run-1:42120565:main:part:1",
          }),
          expect.objectContaining({
            status: "sent",
            messageId: "102",
            idempotencyKey: "telegram:final:run-1:42120565:main:part:2",
          }),
        ],
      }],
    })
    expect(recordOutgoingMessageRef).toHaveBeenCalledTimes(2)
  })

  it("does not send unreviewed text chunks as Telegram final text", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockResolvedValue([101]),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-unreviewed-telegram",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({ type: "text", delta: "검토되지 않은 원문" })
    await onChunk?.({ type: "text", delta: "검토되지 않은 모델 원문", textSource: "llm_generated" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(responder.sendFinalResponse).not.toHaveBeenCalled()
    expect(receipt).toBeUndefined()
  })

  it("returns artifact delivery receipt for successful file delivery", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn().mockResolvedValue(303),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn(),
    }
    const recordOutgoingMessageRef = vi.fn()
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-2",
      recordOutgoingMessageRef,
      logError: vi.fn(),
    })

    const receipt = await onChunk?.({
      type: "tool_end",
      toolName: "telegram_send_file",
      success: true,
      output: "sent",
      details: {
        kind: "artifact_delivery",
        channel: "telegram",
        filePath: "/tmp/result.png",
        caption: "caption",
        size: 123,
        source: "telegram",
      },
    })

    expect(responder.sendFile).toHaveBeenCalledWith("/tmp/result.png", "caption")
    expect(receipt).toMatchObject({
      artifactDeliveries: [{
        toolName: "telegram_send_file",
        channel: "telegram",
        filePath: "/tmp/result.png",
        caption: "caption",
        messageId: 303,
        deliveryReceipts: [
          expect.objectContaining({
            status: "sent",
            messageId: "303",
            idempotencyKey: "telegram:file:run-2:/tmp/result.png",
          }),
        ],
      }],
    })
    expect(recordOutgoingMessageRef).toHaveBeenCalledTimes(1)
  })

  it("redacts Yeonjang internal evidence from artifact captions", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn().mockResolvedValue(313),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-telegram-redacted-artifact",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    const receipt = await onChunk?.({
      type: "tool_end",
      toolName: "screen_capture",
      success: true,
      output: "sent",
      details: {
        kind: "artifact_delivery",
        channel: "telegram",
        filePath: "/tmp/redacted.png",
        caption:
          "yeonjang-goal-validation:screen_capture:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:telegram-artifact raw observed state",
        size: 123,
        source: "telegram",
      },
    })

    expect(responder.sendFile).toHaveBeenCalledWith(
      "/tmp/redacted.png",
      "작업 결과를 확인하기 위해 추가 확인이 필요합니다.",
    )
    expect(receipt?.artifactDeliveries?.[0]?.caption).toBe(
      "작업 결과를 확인하기 위해 추가 확인이 필요합니다.",
    )
    const serialized = JSON.stringify(receipt)
    expect(serialized).not.toContain("yeonjang-goal-validation")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("operation:telegram-artifact")
    expect(serialized).not.toContain("raw observed state")
  })

  it("does not send the same artifact twice for one run", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn().mockResolvedValueOnce(303).mockResolvedValueOnce(404),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn(),
    }
    const recordOutgoingMessageRef = vi.fn()
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-duplicate-artifact",
      recordOutgoingMessageRef,
      logError: vi.fn(),
    })
    const chunk = {
      type: "tool_end" as const,
      toolName: "telegram_send_file",
      success: true,
      output: "sent",
      details: {
        kind: "artifact_delivery" as const,
        channel: "telegram" as const,
        filePath: "/tmp/duplicate-result.png",
        caption: "caption",
        size: 123,
        source: "telegram",
      },
    }

    const firstReceipt = await onChunk?.(chunk)
    const secondReceipt = await onChunk?.(chunk)

    expect(responder.sendFile).toHaveBeenCalledTimes(1)
    expect(responder.sendFile).toHaveBeenCalledWith("/tmp/duplicate-result.png", "caption")
    expect(firstReceipt).toMatchObject({
      artifactDeliveries: [{
        toolName: "telegram_send_file",
        channel: "telegram",
        filePath: "/tmp/duplicate-result.png",
        caption: "caption",
        messageId: 303,
        deliveryReceipts: [
          expect.objectContaining({
            status: "sent",
            messageId: "303",
            idempotencyKey: "telegram:file:run-duplicate-artifact:/tmp/duplicate-result.png",
          }),
        ],
      }],
    })
    expect(secondReceipt).toBeUndefined()
    expect(recordOutgoingMessageRef).toHaveBeenCalledTimes(1)
  })

  it("sends tool status and error messages through the responder", async () => {
    const responder = {
      sendToolStatus: vi.fn().mockResolvedValue(404),
      updateToolStatus: vi.fn(),
      clearToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn().mockResolvedValue(505),
    }
    const recordOutgoingMessageRef = vi.fn()
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-3",
      recordOutgoingMessageRef,
      logError: vi.fn(),
      noticeRendering: {
        config: DEFAULT_CONFIG,
        renderFinalResponseText: vi.fn(async (input) =>
          buildReviewedFinalResponse(input, `rendered: ${input.rawText}`)),
        getDefaultModel: () => "gpt-test",
        workDir: "/tmp",
      },
    })

    await onChunk?.({
      type: "tool_start",
      toolName: "screen_capture",
      params: {},
    })
    await onChunk?.({
      type: "error",
      message: "failure",
    })

    expect(responder.sendToolStatus).toHaveBeenCalledWith("screen_capture")
    expect(responder.sendError).toHaveBeenCalledWith("rendered: Channel execution failed. Reason: failure")
    expect(recordOutgoingMessageRef).toHaveBeenCalledTimes(2)
  })

  it("does not create successful shell_exec status messages", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      clearToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-shell-success",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({
      type: "tool_start",
      toolName: "shell_exec",
      params: { command: "pwd" },
    })
    await onChunk?.({
      type: "tool_end",
      toolName: "shell_exec",
      success: true,
      output: "ok",
    })

    expect(responder.sendToolStatus).not.toHaveBeenCalled()
    expect(responder.updateToolStatus).not.toHaveBeenCalled()
    expect(responder.clearToolStatus).not.toHaveBeenCalled()
  })

  it("clears successful non-shell tool status messages instead of leaving done messages", async () => {
    const responder = {
      sendToolStatus: vi.fn().mockResolvedValue(606),
      updateToolStatus: vi.fn(),
      clearToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-tool-success",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({
      type: "tool_start",
      toolName: "screen_capture",
      params: {},
    })
    await onChunk?.({
      type: "tool_end",
      toolName: "screen_capture",
      success: true,
      output: "captured",
    })

    expect(responder.sendToolStatus).toHaveBeenCalledWith("screen_capture")
    expect(responder.clearToolStatus).toHaveBeenCalledWith(606)
    expect(responder.updateToolStatus).not.toHaveBeenCalled()
  })

  it("keeps failed shell_exec status visible", async () => {
    const responder = {
      sendToolStatus: vi.fn().mockResolvedValue(707),
      updateToolStatus: vi.fn(),
      clearToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn(),
    }
    const recordOutgoingMessageRef = vi.fn()
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-shell-failure",
      recordOutgoingMessageRef,
      logError: vi.fn(),
    })

    await onChunk?.({
      type: "tool_start",
      toolName: "shell_exec",
      params: { command: "missing" },
    })
    await onChunk?.({
      type: "tool_end",
      toolName: "shell_exec",
      success: false,
      output: "command not found",
    })

    expect(responder.sendToolStatus).toHaveBeenCalledWith("shell_exec")
    expect(responder.updateToolStatus).toHaveBeenCalledWith(707, "shell_exec", false)
    expect(responder.clearToolStatus).not.toHaveBeenCalled()
    expect(recordOutgoingMessageRef).toHaveBeenCalledTimes(1)
  })

  it("delivers artifact first and suppresses later AI text for tool-owned responses", async () => {
    const order: string[] = []
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn().mockImplementation(async () => {
        order.push("file")
        return 606
      }),
      sendFinalResponse: vi.fn().mockImplementation(async () => {
        order.push("text")
        return [707]
      }),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-4",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({ type: "text", delta: "이 텍스트는 artifact 전달 시 버려집니다." })
    await onChunk?.({
      type: "tool_end",
      toolName: "telegram_send_file",
      success: true,
      output: "sent",
      details: {
        kind: "artifact_delivery",
        channel: "telegram",
        filePath: "/tmp/result.png",
        size: 123,
        source: "telegram",
      },
    })
    await onChunk?.({ type: "text", delta: "파일 전달이 완료되었습니다." })
    await onChunk?.({ type: "done", totalTokens: 0 })

    expect(order).toEqual(["file"])
    expect(responder.sendFinalResponse).not.toHaveBeenCalled()
  })

  it("delivers one reviewed canonical final answer after an artifact", async () => {
    const order: string[] = []
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn().mockImplementation(async () => {
        order.push("file")
        return 606
      }),
      sendFinalResponse: vi.fn().mockImplementation(async () => {
        order.push("text")
        return [707]
      }),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-artifact-final",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    const artifactReceipt = await onChunk?.({
      type: "tool_end",
      toolName: "telegram_send_file",
      success: true,
      output: "sent",
      details: {
        kind: "artifact_delivery",
        channel: "telegram",
        filePath: "/tmp/result.png",
        size: 123,
        source: "telegram",
      },
    })
    await onChunk?.({
      type: "text",
      delta: "사진을 촬영해 전달했습니다.",
      textSource: "llm_reviewed",
    })
    const finalReceipt = await onChunk?.({ type: "done", totalTokens: 0 })
    await onChunk?.({
      type: "text",
      delta: "중복 최종 답변",
      textSource: "llm_reviewed",
    })
    const duplicateReceipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(order).toEqual(["file", "text"])
    expect(artifactReceipt?.artifactDeliveries).toHaveLength(1)
    expect(finalReceipt?.textDeliveries).toMatchObject([{
      channel: "telegram",
      text: "사진을 촬영해 전달했습니다.",
    }])
    expect(duplicateReceipt).toBeUndefined()
    expect(responder.sendFinalResponse).toHaveBeenCalledTimes(1)
  })

  it("clears buffered preamble text after artifact delivery succeeds", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn().mockResolvedValue(808),
      sendFinalResponse: vi.fn().mockResolvedValue([909]),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-5",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({ type: "text", delta: "The request to capture the main all screen has been received." })
    await onChunk?.({
      type: "tool_end",
      toolName: "telegram_send_file",
      success: true,
      output: "sent",
      details: {
        kind: "artifact_delivery",
        channel: "telegram",
        filePath: "/tmp/result.png",
        size: 123,
        source: "telegram",
      },
    })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(responder.sendFile).toHaveBeenCalledTimes(1)
    expect(responder.sendFinalResponse).not.toHaveBeenCalled()
    expect(receipt).toBeUndefined()
  })

  it("uses isolated Yeonjang tool output as the only final response", async () => {
    const responder = {
      sendToolStatus: vi.fn().mockResolvedValue(1001),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockResolvedValue([1002]),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-6",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({ type: "text", delta: "먼저 들어온 AI 안내문" })
    await onChunk?.({
      type: "tool_start",
      toolName: "yeonjang_camera_list",
      params: {},
    })
    await onChunk?.({
      type: "tool_end",
      toolName: "yeonjang_camera_list",
      success: true,
      output: "연장 \"yeonjang-main\" 카메라 1개:\n- FaceTime HD Camera · 사용 가능 (default)",
      details: {
        via: "yeonjang",
        responseOwnership: "final_text",
      },
    })
    await onChunk?.({ type: "text", delta: "나중에 생성된 AI 요약문" })
    await onChunk?.({ type: "error", message: "late failure" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(responder.sendError).not.toHaveBeenCalled()
    expect(responder.sendFinalResponse).toHaveBeenCalledWith(
      "연장 \"yeonjang-main\" 카메라 1개:\n- FaceTime HD Camera · 사용 가능 (default)",
    )
    expect(receipt).toMatchObject({
      textDeliveries: [{
        channel: "telegram",
        text: "연장 \"yeonjang-main\" 카메라 1개:\n- FaceTime HD Camera · 사용 가능 (default)",
        messageIds: [1002],
        deliveryReceipts: [
          expect.objectContaining({
            status: "sent",
            messageId: "1002",
            idempotencyKey: "telegram:final:run-6:42120565:main:part:1",
          }),
        ],
      }],
    })
  })

  it("uses explicit final-text ownership for Yeonjang-backed action output", async () => {
    const responder = {
      sendToolStatus: vi.fn().mockResolvedValue(1101),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockResolvedValue([1102]),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-7",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({ type: "text", delta: "AI가 먼저 만든 안내문" })
    await onChunk?.({
      type: "tool_end",
      toolName: "mouse_click",
      success: true,
      output: "(120, 240) 클릭 완료",
      details: {
        via: "yeonjang",
        responseOwnership: "final_text",
        x: 120,
        y: 240,
        button: "left",
      },
    })
    await onChunk?.({ type: "text", delta: "나중에 생성된 AI 설명" })
    await onChunk?.({ type: "done", totalTokens: 0 })

    expect(responder.sendFinalResponse).toHaveBeenCalledWith("(120, 240) 클릭 완료")
    expect(responder.sendError).not.toHaveBeenCalled()
  })

  it("redacts Yeonjang internal evidence from isolated final-text tool output", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockResolvedValue([1152]),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-telegram-redacted-text",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({
      type: "tool_end",
      toolName: "mouse_click",
      success: true,
      output:
        "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:telegram-redacted receipt payload raw observed state",
      details: {
        via: "yeonjang",
        responseOwnership: "final_text",
      },
    })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(responder.sendFinalResponse).toHaveBeenCalledWith(
      "작업 결과를 확인하기 위해 추가 확인이 필요합니다.",
    )
    const serialized = JSON.stringify(receipt)
    expect(serialized).not.toContain("yeonjang-goal-validation")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("operation:telegram-redacted")
    expect(serialized).not.toContain("receipt payload")
    expect(serialized).not.toContain("raw observed state")
  })

  it("falls back to a compact diagnostic message when final text would create too many chunks", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockResolvedValue([1201]),
      sendError: vi.fn(),
    }
    const recordOutgoingMessageRef = vi.fn()
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-too-many-chunks",
      maxTextChunks: 1,
      recordOutgoingMessageRef,
      logError: vi.fn(),
    })
    const longText = "a".repeat(4100)

    await onChunk?.({ type: "text", delta: longText, textSource: "llm_reviewed" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(responder.sendFinalResponse).toHaveBeenCalledTimes(1)
    const deliveredText = responder.sendFinalResponse.mock.calls[0]?.[0]
    expect(deliveredText).toContain("결과가 너무 길어")
    expect(deliveredText).not.toBe(longText)
    expect(receipt).toMatchObject({
      textDeliveries: [{
        channel: "telegram",
        text: deliveredText,
        messageIds: [1201],
        deliveryKind: "diagnostic",
        deliveryReceipts: [
          expect.objectContaining({
            status: "sent",
            messageId: "1201",
            idempotencyKey: "telegram:final:run-too-many-chunks:42120565:main:part:1",
          }),
        ],
      }],
    })
    expect(recordOutgoingMessageRef).toHaveBeenCalledTimes(1)
  })

  it("records text delivery failures without failing the execution chunk", async () => {
    const logError = vi.fn()
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockRejectedValue(new Error("telegram unavailable")),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-delivery-failure",
      recordOutgoingMessageRef: vi.fn(),
      logError,
    })

    await onChunk?.({ type: "text", delta: "final answer", textSource: "llm_reviewed" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(receipt).toBeUndefined()
    expect(responder.sendFinalResponse).toHaveBeenCalledWith("final answer")
    expect(logError).toHaveBeenCalledWith("Failed to send Telegram text delivery: telegram unavailable")
  })

  it("redacts Telegram text delivery errors before invoking logError", async () => {
    const logError = vi.fn()
    const rawToken = "sk-telegram-delivery-secret-1234567890"
    const rawPath = "/Users/example/private/telegram-delivery.log"
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockRejectedValue(new Error(`telegram failed token=${rawToken} path=${rawPath}`)),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      getRunId: () => "run-telegram-redaction",
      recordOutgoingMessageRef: vi.fn(),
      logError,
    })

    await onChunk?.({ type: "text", delta: "redacted telegram response", textSource: "llm_reviewed" })
    await onChunk?.({ type: "done", totalTokens: 0 })
    const payload = JSON.stringify(logError.mock.calls)

    expect(payload).not.toContain(rawToken)
    expect(payload).not.toContain(rawPath)
    expect(payload).toContain("***")
    expect(payload).toContain("[internal-path-redacted]")
  })
})
