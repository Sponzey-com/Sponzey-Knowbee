import { describe, expect, it } from "vitest"
import {
  buildTelegramAttachmentDownloadFailureNotice,
  resolveTelegramAttachmentNoticeLanguage,
} from "../packages/core/src/channels/telegram/attachment-notice.ts"

describe("task0835 Telegram attachment failure notice language boundary", () => {
  it("resolves Telegram attachment notice language while preserving Korean fallback", () => {
    expect(resolveTelegramAttachmentNoticeLanguage("ko")).toBe("ko")
    expect(resolveTelegramAttachmentNoticeLanguage("ko-KR")).toBe("ko")
    expect(resolveTelegramAttachmentNoticeLanguage("en")).toBe("en")
    expect(resolveTelegramAttachmentNoticeLanguage("en-US")).toBe("en")
    expect(resolveTelegramAttachmentNoticeLanguage(undefined)).toBe("ko")
  })

  it("builds English document and photo download failure notices", () => {
    expect(buildTelegramAttachmentDownloadFailureNotice({
      attachmentKind: "document",
      language: "en",
      reason: "HTTP 403",
    })).toMatchObject({
      kind: "telegram_attachment_download_failed",
      attachmentKind: "document",
      language: "en",
      text: "File download failed: HTTP 403",
      textSource: "telegram_attachment_control_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })

    expect(buildTelegramAttachmentDownloadFailureNotice({
      attachmentKind: "photo",
      language: "en",
      reason: "Response body is null",
    }).text).toBe("Photo download failed: Response body is null")
  })
})
