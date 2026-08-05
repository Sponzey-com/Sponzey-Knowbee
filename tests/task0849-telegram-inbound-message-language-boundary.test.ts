import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  resolveTelegramInboundMessageLanguage,
} from "../packages/core/src/channels/telegram/bot.ts"

describe("task0849 Telegram inbound message language boundary", () => {
  it("resolves Telegram inbound language from user-visible message text", () => {
    expect(resolveTelegramInboundMessageLanguage("Please capture the main screen")).toBe("en")
    expect(resolveTelegramInboundMessageLanguage("메인 화면 캡쳐해서 보여줘")).toBe("ko")
    expect(resolveTelegramInboundMessageLanguage("메인 화면 capture 해줘")).toBe("ko")
    expect(resolveTelegramInboundMessageLanguage("Please ask 노비 to capture the screen")).toBe("en")
  })

  it("uses one inbound language for Telegram approval, responder, continuation, and chunk delivery", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/channels/telegram/bot.ts"),
      "utf8",
    )

    expect(source).toContain("const language = resolveTelegramInboundMessageLanguage(text)")
    expect(source).toContain("setActiveChatForSession(sessionId, chatId, userId, threadId, language)")
    expect(source).toContain("new TelegramResponder(this.bot, chatId, threadId, language)")
    expect(source).toContain("resolveChannelContinuation({\n        envelope: access.envelope,\n        language,")
    expect(source).toContain("createTelegramChunkDeliveryHandler({")
    expect(source).toContain("language,")
    expect(source).not.toContain("const approvalLanguage = resolveTelegramApprovalRequestLanguage(ctx.from?.language_code)")
  })
})
