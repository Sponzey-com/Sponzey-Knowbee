import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildChannelIngressFailureNotice,
} from "../packages/core/src/channels/ingress-failure-notice.ts"

describe("task0799 channel ingress failure notice", () => {
  it("builds Korean ingress failure notice for Korean requests", () => {
    expect(buildChannelIngressFailureNotice({
      provider: "telegram",
      userMessage: "화면 캡처해줘",
      reason: "timeout",
    })).toEqual({
      kind: "channel_ingress_failed",
      provider: "telegram",
      language: "ko",
      reason: "timeout",
      text: "요청 처리 중 채널 오류가 발생했습니다. 원인: timeout",
      deliveryMode: "diagnostic",
      textSource: "channel_ingress_failure_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("builds English ingress failure notice for English requests", () => {
    expect(buildChannelIngressFailureNotice({
      provider: "slack",
      userMessage: "capture the screen",
      reason: "socket closed",
    })).toMatchObject({
      provider: "slack",
      language: "en",
      text: "Channel request processing failed. Reason: socket closed",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("routes Slack and Telegram ingress catch paths through the notice builder", () => {
    const root = process.cwd()
    const slackBot = readFileSync(join(root, "packages/core/src/channels/slack/bot.ts"), "utf-8")
    const telegramBot = readFileSync(join(root, "packages/core/src/channels/telegram/bot.ts"), "utf-8")

    expect(slackBot).toContain("buildChannelIngressFailureNotice")
    expect(telegramBot).toContain("buildChannelIngressFailureNotice")
    expect(slackBot).toContain("renderChannelNoticeText")
    expect(telegramBot).toContain("renderChannelNoticeText")
    expect(slackBot).not.toContain("sendError(notice.text)")
    expect(telegramBot).not.toContain("sendError(notice.text)")
  })
})
