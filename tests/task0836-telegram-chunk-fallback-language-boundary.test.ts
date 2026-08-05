import { describe, expect, it, vi } from "vitest"
import {
  buildTelegramArtifactFallbackNotice,
  buildTelegramTooManyChunksFallbackNotice,
  createTelegramChunkDeliveryHandler,
  resolveTelegramChunkFallbackLanguage,
} from "../packages/core/src/channels/telegram/chunk-delivery.ts"

describe("task0836 Telegram chunk fallback language boundary", () => {
  it("resolves Telegram chunk fallback language while preserving Korean fallback", () => {
    expect(resolveTelegramChunkFallbackLanguage("ko")).toBe("ko")
    expect(resolveTelegramChunkFallbackLanguage("ko-KR")).toBe("ko")
    expect(resolveTelegramChunkFallbackLanguage("en")).toBe("en")
    expect(resolveTelegramChunkFallbackLanguage("en-US")).toBe("en")
    expect(resolveTelegramChunkFallbackLanguage(undefined)).toBe("ko")
  })

  it("builds English artifact fallback notices", () => {
    expect(buildTelegramArtifactFallbackNotice({
      language: "en",
      fileName: "report.pdf",
    })).toMatchObject({
      kind: "telegram_chunk_fallback",
      reason: "artifact_upload_failed",
      language: "en",
      textSource: "telegram_chunk_fallback_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
      text: "File upload failed. No safe download link could be created in this chat.\n- File: report.pdf",
    })

    expect(buildTelegramArtifactFallbackNotice({
      language: "en",
      fileName: "report.pdf",
      downloadUrl: "/api/artifacts/report.pdf?download=1",
      caption: "Quarterly report",
    }).text).toBe(
      "File upload failed, so a download link is provided in this chat instead.\n- File: Quarterly report\n- Download: /api/artifacts/report.pdf?download=1",
    )
  })

  it("builds English too-many-chunks fallback notice", () => {
    const notice = buildTelegramTooManyChunksFallbackNotice({
      language: "en",
      text: "a".repeat(1300),
      estimatedChunks: 24,
      maxChunks: 3,
    })

    expect(notice.text).toContain("The result is too long and could be split into 24 Telegram messages")
    expect(notice.text).toContain("Maximum allowed chunks: 3")
    expect(notice.text).toContain("...[truncated]")
  })

  it("uses context language for too-many-chunks fallback delivery", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn().mockResolvedValue([1201]),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      responder,
      sessionId: "telegram-session",
      chatId: 42120565,
      language: "en",
      getRunId: () => "run-task0836",
      maxTextChunks: 1,
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({ type: "text", delta: "a".repeat(4100), textSource: "llm_reviewed" })
    await onChunk?.({ type: "done", totalTokens: 0 })

    expect(responder.sendFinalResponse).toHaveBeenCalledWith(expect.stringContaining("The result is too long"))
  })
})
