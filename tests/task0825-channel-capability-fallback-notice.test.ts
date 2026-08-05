import { describe, expect, it } from "vitest"
import { buildCapabilityFallbackNotice } from "../packages/core/src/channels/delivery-fallback.ts"

describe("task0825 channel capability fallback notice", () => {
  it("builds unsupported capability fallback as a non-final control notice", () => {
    expect(buildCapabilityFallbackNotice({
      status: "unsupported_capability",
      capability: "supportsButtons",
      errorCode: "buttons_unavailable",
    })).toEqual({
      kind: "channel_capability_fallback_notice",
      title: "Unsupported channel capability",
      message: "This channel does not support interactive buttons. Use a text fallback or Web UI approval.",
      severity: "warning",
      deliveryMode: "fallback_notice",
      textSource: "channel_capability_fallback_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
      language: "en",
      capability: "supportsButtons",
      errorCode: "buttons_unavailable",
    })
  })

  it("does not build a fallback notice for successful receipts", () => {
    expect(buildCapabilityFallbackNotice({
      status: "sent",
      capability: "supportsButtons",
    })).toBeUndefined()
  })
})
