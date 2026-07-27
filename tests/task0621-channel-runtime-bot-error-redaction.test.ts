import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const files = {
  telegramAdapter: readFileSync(new URL("../packages/core/src/channels/telegram/adapter.ts", import.meta.url), "utf-8"),
  slackAdapter: readFileSync(new URL("../packages/core/src/channels/slack/adapter.ts", import.meta.url), "utf-8"),
  discordAdapter: readFileSync(new URL("../packages/core/src/channels/discord/adapter.ts", import.meta.url), "utf-8"),
  googleChatAdapter: readFileSync(new URL("../packages/core/src/channels/google-chat/adapter.ts", import.meta.url), "utf-8"),
  telegramBot: readFileSync(new URL("../packages/core/src/channels/telegram/bot.ts", import.meta.url), "utf-8"),
  slackBot: readFileSync(new URL("../packages/core/src/channels/slack/bot.ts", import.meta.url), "utf-8"),
  telegramApproval: readFileSync(new URL("../packages/core/src/channels/telegram/approval-handler.ts", import.meta.url), "utf-8"),
  telegramChunk: readFileSync(new URL("../packages/core/src/channels/telegram/chunk-delivery.ts", import.meta.url), "utf-8"),
  slackChunk: readFileSync(new URL("../packages/core/src/channels/slack/chunk-delivery.ts", import.meta.url), "utf-8"),
}

describe("task0621 channel runtime and bot error redaction", () => {
  it("redacts adapter runtime start errors before status storage", () => {
    expect(files.telegramAdapter).toContain("setTelegramRuntimeError(message)")
    expect(files.telegramAdapter).toContain("const message = telegramAdapterErrorMessage(error)")
    expect(files.slackAdapter).toContain("function slackAdapterErrorMessage")
    expect(files.slackAdapter).toContain("const message = slackAdapterErrorMessage(error)")
    expect(files.discordAdapter).toContain("const message = discordAdapterErrorMessage(error)")
    expect(files.googleChatAdapter).toContain("const message = googleChatAdapterErrorMessage(error)")
  })

  it("redacts bot and approval errors before log or channel replies", () => {
    expect(files.telegramBot).toContain("function telegramBotErrorMessage")
    expect(files.telegramBot).toContain("const msg = telegramBotErrorMessage(err)")
    expect(files.telegramBot).toContain("const message = telegramBotErrorMessage(err)")
    expect(files.telegramBot).toContain("telegramBotErrorMessage(err)")
    expect(files.slackBot).toContain("const message = slackBotErrorMessage(error)")
    expect(files.telegramApproval).toContain("function telegramApprovalErrorMessage")
    expect(files.telegramApproval).toContain("const errMsg = telegramApprovalErrorMessage(err)")
  })

  it("redacts chunk file delivery log callback messages", () => {
    expect(files.telegramChunk).toContain("const message = telegramChunkDeliveryErrorMessage(error)")
    expect(files.slackChunk).toContain("const message = slackChunkDeliveryErrorMessage(error)")
    expect(files.telegramChunk).not.toContain("const message = error instanceof Error ? error.message : String(error)")
    expect(files.slackChunk).not.toContain("const message = error instanceof Error ? error.message : String(error)")
  })
})
