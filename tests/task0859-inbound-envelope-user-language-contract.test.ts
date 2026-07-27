import { describe, expect, it } from "vitest"
import {
  normalizeTelegramInboundUpdate,
} from "../packages/core/src/channels/telegram/adapter.ts"
import {
  normalizeSlackInboundEvent,
} from "../packages/core/src/channels/slack/adapter.ts"
import {
  normalizeDiscordInboundEvent,
} from "../packages/core/src/channels/discord/adapter.ts"
import {
  normalizeGoogleChatInboundEvent,
} from "../packages/core/src/channels/google-chat/adapter.ts"
import {
  resolveUserFacingMessageLanguage,
} from "../packages/core/src/channels/language.ts"

describe("task0859 inbound envelope user language contract", () => {
  it("normalizes primary message language to supported user-facing languages", () => {
    expect(resolveUserFacingMessageLanguage("메인 화면 capture 해줘")).toBe("ko")
    expect(resolveUserFacingMessageLanguage("Please ask 노비 to capture the screen")).toBe("en")
    expect(resolveUserFacingMessageLanguage("12345")).toBe("en")
  })

  it("sets Telegram envelope language from normalized message text", () => {
    const envelopes = normalizeTelegramInboundUpdate({
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 10, type: "private" },
        from: { id: 20, is_bot: false, first_name: "User" },
        text: "메인 화면 capture 해줘",
      },
    })

    expect(envelopes[0]?.text).toBe("메인 화면 capture 해줘")
    expect(envelopes[0]?.userFacingLanguage).toBe("ko")
  })

  it("sets Slack envelope language after mention stripping", () => {
    const envelopes = normalizeSlackInboundEvent({
      team_id: "T1",
      event: {
        type: "app_mention",
        user: "U1",
        channel: "C1",
        ts: "1000.0001",
        event_ts: "1000.0001",
        text: "<@B1> Please ask 노비 to capture the screen",
      },
    }, { botUserId: "B1" })

    expect(envelopes[0]?.text).toBe("Please ask 노비 to capture the screen")
    expect(envelopes[0]?.userFacingLanguage).toBe("en")
  })

  it("sets Discord envelope language after mention stripping", () => {
    const envelopes = normalizeDiscordInboundEvent({
      id: "m1",
      channel_id: "c1",
      guild_id: "g1",
      author: { id: "111", username: "user" },
      content: "<@222> 상태 알려줘 status",
      timestamp: "2026-07-09T00:00:00.000Z",
      mentions: [{ id: "222", username: "Knowbee" }],
    }, { botUserId: "222" })

    expect(envelopes[0]?.text).toBe("상태 알려줘 status")
    expect(envelopes[0]?.userFacingLanguage).toBe("ko")
  })

  it("sets Google Chat envelope language from argument text", () => {
    const envelopes = normalizeGoogleChatInboundEvent({
      token: "expected-token",
      type: "MESSAGE",
      eventTime: "2026-07-09T00:00:00.000Z",
      user: { name: "users/u1", displayName: "User", type: "HUMAN" },
      space: { name: "spaces/s1", type: "ROOM" },
      message: {
        name: "spaces/s1/messages/m1",
        argumentText: "Please summarize 노비 status",
        thread: { name: "spaces/s1/threads/t1" },
      },
    }, { verificationToken: "expected-token" })

    expect(envelopes[0]?.text).toBe("Please summarize 노비 status")
    expect(envelopes[0]?.userFacingLanguage).toBe("en")
  })
})
