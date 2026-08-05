import { describe, expect, it, vi } from "vitest"
import { buildChannelChunkErrorNotice } from "../packages/core/src/channels/chunk-error-notice.ts"
import { createTelegramChunkDeliveryHandler } from "../packages/core/src/channels/telegram/chunk-delivery.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

describe("task0838 channel chunk error language boundary", () => {
  it("builds Korean chunk error notices as non-final control notices", () => {
    expect(buildChannelChunkErrorNotice({
      provider: "telegram",
      language: "ko",
      reason: "timeout",
    })).toEqual({
      kind: "channel_chunk_error",
      provider: "telegram",
      stage: "chunk_delivery",
      language: "ko",
      reason: "timeout",
      text: "채널 실행 중 오류가 발생했습니다. 원인: timeout",
      deliveryMode: "diagnostic",
      textSource: "channel_chunk_error_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("uses Telegram chunk context language for error delivery", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn().mockResolvedValue(909),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      language: "ko",
      getRunId: () => undefined,
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
      noticeRendering: {
        config: DEFAULT_CONFIG,
        renderFinalResponseText: vi.fn(async (input) => buildReviewedFinalResponse(
          input,
          `렌더링됨: ${input.rawText}`,
        )),
        getDefaultModel: () => "gpt-test",
        workDir: "/tmp",
      },
    })

    await onChunk?.({ type: "error", message: "timeout" })

    expect(responder.sendError).toHaveBeenCalledWith("렌더링됨: 채널 실행 중 오류가 발생했습니다. 원인: timeout")
    expect(JSON.stringify(responder.sendError.mock.calls)).not.toContain("Channel execution failed")
  })

  it("does not send raw Telegram chunk error text when rendering fails", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn().mockResolvedValue(909),
    }
    const logError = vi.fn()
    const onChunk = createTelegramChunkDeliveryHandler({
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      language: "ko",
      getRunId: () => undefined,
      recordOutgoingMessageRef: vi.fn(),
      logError,
      noticeRendering: {
        config: DEFAULT_CONFIG,
        renderFinalResponseText: vi.fn(async () => null),
        getDefaultModel: () => "gpt-test",
        workDir: "/tmp",
      },
    })

    await onChunk?.({ type: "error", message: "timeout" })

    expect(responder.sendError).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalledWith("Skipped Telegram chunk error notice delivery: channel_notice_render_failed")
  })
})
