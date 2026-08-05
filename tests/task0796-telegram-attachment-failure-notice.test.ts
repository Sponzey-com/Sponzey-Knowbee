import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
  buildTelegramAttachmentDownloadFailureNotice,
} from "../packages/core/src/channels/telegram/attachment-notice.ts"

describe("task0796 telegram attachment failure notice", () => {
  it("builds document download failure as a non-final channel notice", () => {
    expect(buildTelegramAttachmentDownloadFailureNotice({
      attachmentKind: "document",
      reason: "HTTP 403",
    })).toEqual({
      kind: "telegram_attachment_download_failed",
      attachmentKind: "document",
      language: "ko",
      text: "파일 다운로드 실패: HTTP 403",
      deliveryMode: "receipt",
      textSource: "telegram_attachment_control_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("builds photo download failure as a non-final channel notice", () => {
    expect(buildTelegramAttachmentDownloadFailureNotice({
      attachmentKind: "photo",
      reason: "Response body is null",
    })).toMatchObject({
      kind: "telegram_attachment_download_failed",
      attachmentKind: "photo",
      language: "ko",
      text: "사진 다운로드 실패: Response body is null",
      textSource: "telegram_attachment_control_notice",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("routes attachment failure replies through final response rendering", () => {
    const source = readFileSync("packages/core/src/channels/telegram/bot.ts", "utf8")

    expect(source).toContain("renderChannelNoticeText")
    expect(source).toContain("Skipped Telegram attachment failure notice delivery")
    expect(source).not.toContain("ctx.reply(notice.text)")
  })
})
