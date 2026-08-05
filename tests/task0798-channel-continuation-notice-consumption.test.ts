import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task0798 channel continuation notice consumption", () => {
  it("uses continuation notice text in channel bots instead of legacy fallback wording", () => {
    const root = process.cwd()
    const slackBot = readFileSync(join(root, "packages/core/src/channels/slack/bot.ts"), "utf-8")
    const telegramBot = readFileSync(join(root, "packages/core/src/channels/telegram/bot.ts"), "utf-8")

    for (const source of [slackBot, telegramBot]) {
      expect(source).toContain("continuation.confirmationNotice?.text")
      expect(source).toContain("renderChannelNoticeText")
      expect(source).toContain("Skipped")
      expect(source).not.toContain("Please choose which previous task to continue.")
      expect(source).not.toContain("sendReceipt(confirmationText)")
    }
  })
})
