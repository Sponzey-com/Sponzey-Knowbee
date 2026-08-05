import { describe, expect, it } from "vitest"
import { describeUnsupportedCapability } from "../packages/core/src/channels/delivery-fallback.ts"

describe("task0991 channel capability notice agent-name neutrality", () => {
  it("keeps unsupported capability notices free of default agent self names", () => {
    const messages = [
      describeUnsupportedCapability("supportsDeletes", "ko"),
      describeUnsupportedCapability("supportsButtons", "ko"),
      describeUnsupportedCapability("supportsFiles", "ko"),
      describeUnsupportedCapability("supportsDeletes", "en"),
      describeUnsupportedCapability("supportsButtons", "en"),
      describeUnsupportedCapability("supportsFiles", "en"),
    ]

    expect(messages.join("\n")).not.toMatch(/\bKnowbee\b/u)
    expect(messages.join("\n")).not.toMatch(/노비/u)
    expect(describeUnsupportedCapability("supportsButtons", "ko")).not.toContain("fallback")
  })
})
