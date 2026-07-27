import { describe, expect, it } from "vitest"
import {
  buildChannelIngressFailureNotice,
} from "../packages/core/src/channels/ingress-failure-notice.ts"

describe("task0848 ingress failure primary language boundary", () => {
  it("uses Korean for mixed ingress failure messages when Korean is the primary request language", () => {
    expect(buildChannelIngressFailureNotice({
      provider: "slack",
      userMessage: "메인 화면 capture 해줘",
      reason: "timeout",
    })).toMatchObject({
      language: "ko",
      text: "요청 처리 중 채널 오류가 발생했습니다. 원인: timeout",
    })
  })

  it("uses English for mixed ingress failure messages when English is the primary request language", () => {
    expect(buildChannelIngressFailureNotice({
      provider: "telegram",
      userMessage: "Please ask 노비 to capture the screen",
      reason: "timeout",
    })).toMatchObject({
      language: "en",
      text: "Channel request processing failed. Reason: timeout",
    })
  })

  it("keeps unknown-language ingress failure messages on the English fallback", () => {
    expect(buildChannelIngressFailureNotice({
      provider: "telegram",
      userMessage: "12345",
      reason: "",
    })).toMatchObject({
      language: "unknown",
      reason: "unknown error",
      text: "Channel request processing failed. Reason: unknown error",
    })
  })
})
