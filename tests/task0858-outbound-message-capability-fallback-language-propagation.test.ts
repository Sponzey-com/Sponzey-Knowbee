import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const adapterPaths = [
  "packages/core/src/channels/telegram/adapter.ts",
  "packages/core/src/channels/slack/adapter.ts",
  "packages/core/src/channels/discord/adapter.ts",
  "packages/core/src/channels/google-chat/adapter.ts",
  "packages/core/src/channels/local-bridge/adapter.ts",
]

describe("task0858 outbound message capability fallback language propagation", () => {
  it("keeps OutboundMessage userFacingLanguage in built-in unsupported capability receipts", () => {
    for (const adapterPath of adapterPaths) {
      const source = readFileSync(join(process.cwd(), adapterPath), "utf8")

      expect(source, adapterPath).toContain("userFacingLanguage: message.userFacingLanguage")
    }
  })

  it("declares userFacingLanguage on OutboundMessage and DeliveryReceipt", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/channels/contracts.ts"),
      "utf8",
    )

    expect(source).toContain("export type DeliveryReceiptUserFacingLanguage = ChannelUserFacingLanguage")
    expect(source).toContain("userFacingLanguage?: DeliveryReceiptUserFacingLanguage")
  })
})
