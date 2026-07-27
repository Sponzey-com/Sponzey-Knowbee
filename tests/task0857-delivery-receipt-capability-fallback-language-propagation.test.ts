import { describe, expect, it } from "vitest"
import { buildCapabilityFallbackNotice } from "../packages/core/src/channels/delivery-fallback.ts"
import {
  buildUnsupportedCapabilityReceipt,
} from "../packages/core/src/channels/contracts.ts"

describe("task0857 delivery receipt capability fallback language propagation", () => {
  it("keeps receipt user-facing language for capability fallback notices", () => {
    const receipt = buildUnsupportedCapabilityReceipt({
      channelId: "telegram:primary",
      provider: "telegram",
      connectionId: "telegram:primary",
      target: { roomId: "1001" },
      capability: "supportsButtons",
      idempotencyKey: "task0857",
      userFacingLanguage: "ko",
    })

    expect(receipt.userFacingLanguage).toBe("ko")
    expect(buildCapabilityFallbackNotice(receipt)).toMatchObject({
      language: "ko",
      title: "지원하지 않는 채널 기능",
      message: "이 채널은 대화형 버튼을 지원하지 않습니다. 텍스트 대체 응답 또는 Web UI 승인을 사용해야 합니다.",
    })
  })
})
