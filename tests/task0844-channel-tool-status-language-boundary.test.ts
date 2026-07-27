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

describe("task0844 channel tool status language boundary", () => {
  it("uses Korean Slack tool status text by default", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { text?: string; ts?: string } : {}
      if (body.ts) {
        expect(body.text).toBe("실패: screen_capture")
      } else {
        expect(body.text).toBe("실행 중: screen_capture...")
      }
      return new Response(JSON.stringify({ ok: true, ts: "1710000100.000100" }))
    })
    vi.stubGlobal("fetch", fetchMock)

    const responder = new SlackResponder(slackConfig, "C_SLACK", "thread-1")

    await expect(responder.sendToolStatus("screen_capture")).resolves.toBe("1710000100.000100")
    await expect(responder.updateToolStatus("tool-ts", "screen_capture", false)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("keeps English Slack tool status text when language is explicit", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { text?: string; ts?: string } : {}
      if (body.ts) {
        expect(body.text).toBe("Done: web_fetch")
      } else {
        expect(body.text).toBe("Running: web_fetch...")
      }
      return new Response(JSON.stringify({ ok: true, ts: "1710000100.000200" }))
    })
    vi.stubGlobal("fetch", fetchMock)

    const responder = new SlackResponder(slackConfig, "C_SLACK", "thread-1", "en")

    await expect(responder.sendToolStatus("web_fetch")).resolves.toBe("1710000100.000200")
    await expect(responder.updateToolStatus("tool-ts", "web_fetch", true)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("uses Korean Telegram tool status text by default", async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 8441 }))
    const editMessageText = vi.fn(async () => undefined)
    const responder = new TelegramResponder({
      api: {
        sendMessage,
        editMessageText,
      },
    } as never, 1001, 3003)

    await expect(responder.sendToolStatus("screen_capture")).resolves.toBe(8441)
    await expect(responder.updateToolStatus(8441, "screen_capture", false)).resolves.toBeUndefined()

    expect(sendMessage).toHaveBeenCalledWith(
      1001,
      "⚙️ 실행 중: `screen_capture`...",
      { parse_mode: "Markdown", message_thread_id: 3003 },
    )
    expect(editMessageText).toHaveBeenCalledWith(
      1001,
      8441,
      "❌ `screen_capture` 실패",
      { parse_mode: "Markdown" },
    )
  })

  it("keeps English Telegram tool status text when language is explicit", async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 8442 }))
    const editMessageText = vi.fn(async () => undefined)
    const responder = new TelegramResponder({
      api: {
        sendMessage,
        editMessageText,
      },
    } as never, 1001, undefined, "en")

    await expect(responder.sendToolStatus("web_fetch")).resolves.toBe(8442)
    await expect(responder.updateToolStatus(8442, "web_fetch", true)).resolves.toBeUndefined()

    expect(sendMessage).toHaveBeenCalledWith(
      1001,
      "⚙️ Running: `web_fetch`...",
      { parse_mode: "Markdown" },
    )
    expect(editMessageText).toHaveBeenCalledWith(
      1001,
      8442,
      "✅ `web_fetch` done",
      { parse_mode: "Markdown" },
    )
  })
})
