import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildChannelChunkErrorNotice } from "../packages/core/src/channels/chunk-error-notice.ts"

describe("task0800 channel chunk error notice", () => {
  it("builds Slack chunk error diagnostic notice", () => {
    expect(buildChannelChunkErrorNotice({
      provider: "slack",
      reason: "execution failed",
    })).toEqual({
      kind: "channel_chunk_error",
      provider: "slack",
      stage: "chunk_delivery",
      language: "en",
      reason: "execution failed",
      text: "Channel execution failed. Reason: execution failed",
      deliveryMode: "diagnostic",
      textSource: "channel_chunk_error_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("builds Telegram chunk error diagnostic notice", () => {
    expect(buildChannelChunkErrorNotice({
      provider: "telegram",
      reason: "timeout",
    })).toMatchObject({
      provider: "telegram",
      stage: "chunk_delivery",
      language: "en",
      text: "Channel execution failed. Reason: timeout",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("routes Slack and Telegram error chunks through the notice builder", () => {
    const root = process.cwd()
    const slackDelivery = readFileSync(join(root, "packages/core/src/channels/slack/chunk-delivery.ts"), "utf-8")
    const telegramDelivery = readFileSync(join(root, "packages/core/src/channels/telegram/chunk-delivery.ts"), "utf-8")

    expect(slackDelivery).toContain("buildChannelChunkErrorNotice")
    expect(telegramDelivery).toContain("buildChannelChunkErrorNotice")
    expect(slackDelivery).toContain("renderChannelNoticeText")
    expect(telegramDelivery).toContain("renderChannelNoticeText")
    expect(slackDelivery).not.toContain("sendError(notice.text)")
    expect(telegramDelivery).not.toContain("sendError(notice.text)")
    expect(slackDelivery).not.toContain("sendError(chunk.message)")
    expect(telegramDelivery).not.toContain("sendError(chunk.message)")
  })
})
