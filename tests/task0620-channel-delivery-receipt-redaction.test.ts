import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const telegramAdapterSource = readFileSync(
  new URL("../packages/core/src/channels/telegram/adapter.ts", import.meta.url),
  "utf-8",
)
const telegramDeliverySource = readFileSync(
  new URL("../packages/core/src/channels/telegram/message-delivery.ts", import.meta.url),
  "utf-8",
)
const slackDeliverySource = readFileSync(
  new URL("../packages/core/src/channels/slack/message-delivery.ts", import.meta.url),
  "utf-8",
)
const discordAdapterSource = readFileSync(
  new URL("../packages/core/src/channels/discord/adapter.ts", import.meta.url),
  "utf-8",
)
const googleChatAdapterSource = readFileSync(
  new URL("../packages/core/src/channels/google-chat/adapter.ts", import.meta.url),
  "utf-8",
)

describe("task0620 channel delivery receipt error redaction", () => {
  it("routes Telegram receipt failures through redaction", () => {
    expect(telegramAdapterSource).toContain("function telegramAdapterErrorMessage")
    expect(telegramAdapterSource).toContain("const messageText = telegramAdapterErrorMessage(error)")
    expect(telegramDeliverySource).toContain("function telegramDeliveryErrorMessage")
    expect(telegramDeliverySource).toContain("const message = telegramDeliveryErrorMessage(params.error)")
    expect(telegramAdapterSource).not.toContain("const messageText = error instanceof Error ? error.message : String(error)")
    expect(telegramDeliverySource).not.toContain("const message = params.error instanceof Error ? params.error.message : String(params.error)")
  })

  it("routes Slack receipt failures through redaction", () => {
    expect(slackDeliverySource).toContain("function slackDeliveryErrorMessage")
    expect(slackDeliverySource).toContain("errorMessage: slackDeliveryErrorMessage(params.error)")
    expect(slackDeliverySource).toContain("const message = slackDeliveryErrorMessage(params.error)")
    expect(slackDeliverySource).not.toContain("errorMessage: params.error.message")
    expect(slackDeliverySource).not.toContain("const message = params.error instanceof Error ? params.error.message : String(params.error)")
  })

  it("routes Discord and Google Chat receipt failures through redaction", () => {
    expect(discordAdapterSource).toContain("function discordAdapterErrorMessage")
    expect(discordAdapterSource).toContain("const messageText = discordAdapterErrorMessage(error)")
    expect(googleChatAdapterSource).toContain("function googleChatAdapterErrorMessage")
    expect(googleChatAdapterSource).toContain("const messageText = googleChatAdapterErrorMessage(error)")
    expect(discordAdapterSource).not.toContain("const messageText = error instanceof Error ? error.message : String(error)")
    expect(googleChatAdapterSource).not.toContain("const messageText = error instanceof Error ? error.message : String(error)")
  })
})
