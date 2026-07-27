import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  resolveTelegramAttachmentFailureLanguage,
} from "../packages/core/src/channels/telegram/bot.ts"

describe("task0852 Telegram attachment failure caption language boundary", () => {
  it("uses caption language before Telegram language_code for attachment failures", () => {
    expect(resolveTelegramAttachmentFailureLanguage("Please inspect this file", "ko-KR")).toBe("en")
    expect(resolveTelegramAttachmentFailureLanguage("이 파일 확인해줘", "en-US")).toBe("ko")
  })

  it("keeps Telegram language_code fallback when caption has no language signal", () => {
    expect(resolveTelegramAttachmentFailureLanguage("", "en-US")).toBe("en")
    expect(resolveTelegramAttachmentFailureLanguage("12345", undefined)).toBe("ko")
  })

  it("uses the caption-aware resolver in document and photo download failure paths", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/channels/telegram/bot.ts"),
      "utf8",
    )

    expect(source).toContain("language: resolveTelegramAttachmentFailureLanguage(message.caption, ctx.from?.language_code)")
    expect(source).not.toContain("language: resolveTelegramAttachmentNoticeLanguage(ctx.from?.language_code)")
  })
})
