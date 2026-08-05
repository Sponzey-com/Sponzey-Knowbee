import { describe, expect, it } from "vitest"
import {
  resolveSlackInboundMessageLanguage,
} from "../packages/core/src/channels/slack/bot.ts"

describe("task0850 Slack inbound primary language boundary", () => {
  it("uses Korean for mixed Slack messages when Korean is the primary request language", () => {
    expect(resolveSlackInboundMessageLanguage("<@B_KNOWBEE> 메인 화면 capture 해줘")).toBe("ko")
  })

  it("uses English for mixed Slack messages when English is the primary request language", () => {
    expect(resolveSlackInboundMessageLanguage("<@B_KNOWBEE> Please ask 노비 to capture the screen")).toBe("en")
  })
})
