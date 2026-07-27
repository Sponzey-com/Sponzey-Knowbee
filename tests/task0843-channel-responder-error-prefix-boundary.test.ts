import { afterEach, describe, expect, it, vi } from "vitest"
import { SlackResponder } from "../packages/core/src/channels/slack/responder.ts"
import { TelegramResponder } from "../packages/core/src/channels/telegram/responder.ts"
import type { SlackConfig } from "../packages/core/src/config/types.ts"

const slackConfig: SlackConfig = {
  enabled: true,
  botToken: "xoxb-slack-secret-token",
  appToken: "xapp-slack-secret-token",
  allowedUserIds: [],
  allowedChannelIds: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("task0843 channel responder error prefix boundary", () => {
  it("sends Slack diagnostic error notice text without adding an Error prefix", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { text?: string } : {}
      expect(body.text).toBe("채널 실행 중 오류가 발생했습니다. 원인: timeout")
      return new Response(JSON.stringify({ ok: true, ts: "1710000100.000100" }))
    })
    vi.stubGlobal("fetch", fetchMock)

    const responder = new SlackResponder(slackConfig, "C_SLACK", "thread-1")
    await expect(responder.sendError("채널 실행 중 오류가 발생했습니다. 원인: timeout"))
      .resolves
      .toBe("1710000100.000100")

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sends Telegram diagnostic error notice text without adding an Error prefix", async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 8483 }))
    const responder = new TelegramResponder({
      api: {
        sendMessage,
      },
    } as never, 1001, 3003)

    await expect(responder.sendError("Channel execution failed. Reason: timeout"))
      .resolves
      .toBe(8483)

    expect(sendMessage).toHaveBeenCalledWith(
      1001,
      "Channel execution failed. Reason: timeout",
      { message_thread_id: 3003 },
    )
  })
})
