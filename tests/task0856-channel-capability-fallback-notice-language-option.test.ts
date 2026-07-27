import { describe, expect, it } from "vitest"
import {
  buildCapabilityFallbackNotice,
  describeUnsupportedCapability,
} from "../packages/core/src/channels/delivery-fallback.ts"

describe("task0856 channel capability fallback notice language option", () => {
  it("builds Korean fallback notice when language is explicit", () => {
    expect(buildCapabilityFallbackNotice({
      status: "unsupported_capability",
      capability: "supportsButtons",
      errorCode: "buttons_unavailable",
      language: "ko",
    })).toEqual({
      kind: "channel_capability_fallback_notice",
      title: "지원하지 않는 채널 기능",
      message: "이 채널은 대화형 버튼을 지원하지 않습니다. 텍스트 대체 응답 또는 Web UI 승인을 사용해야 합니다.",
      severity: "warning",
      deliveryMode: "fallback_notice",
      textSource: "channel_capability_fallback_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
      language: "ko",
      capability: "supportsButtons",
      errorCode: "buttons_unavailable",
    })
  })

  it("describes unknown capabilities in the requested language", () => {
    expect(describeUnsupportedCapability("supportsWidgets", "ko")).toBe(
      "이 채널은 supportsWidgets 기능을 지원하지 않습니다.",
    )
    expect(describeUnsupportedCapability(undefined, "en")).toBe(
      "This channel does not support the requested delivery capability.",
    )
  })
})
