import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0599 settings restart error redaction", () => {
  it("sanitizes channel restart catch errors before response and runtime status", () => {
    const source = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")
    const telegramRestart = source.slice(
      source.indexOf('app.post("/api/settings/telegram/restart"'),
      source.indexOf('app.post("/api/settings/channels/restart"'),
    )
    const channelRestart = source.slice(
      source.indexOf('app.post("/api/settings/channels/restart"'),
      source.indexOf("// POST /api/settings/test-ai"),
    )

    expect(source).toContain('import { redactLogText } from "../../logger/index.js"')
    expect(source).toContain("function settingsRouteErrorSummary(error: unknown)")
    expect(source).toContain("return sanitizeUserFacingError(redactLogText(rawMessage))")

    expect(telegramRestart).toContain("const sanitized = settingsRouteErrorSummary(err)")
    expect(telegramRestart).toContain("setTelegramRuntimeError(message)")
    expect(telegramRestart).toContain("kind: sanitized.kind")
    expect(telegramRestart).toContain("actionHint: sanitized.actionHint")
    expect(telegramRestart).not.toContain("sanitizeUserFacingError(err instanceof Error ? err.message : String(err))")
    expect(telegramRestart).not.toContain("const message = err instanceof Error ? err.message : String(err)")

    expect(channelRestart).toContain("const sanitized = settingsRouteErrorSummary(err)")
    expect(channelRestart).toContain("setSlackRuntimeError(message)")
    expect(channelRestart).toContain("setTelegramRuntimeError(message)")
    expect(channelRestart).toContain("setDiscordRuntimeError(message)")
    expect(channelRestart).toContain("setGoogleChatRuntimeError(message)")
    expect(channelRestart).toContain("kind: sanitized.kind")
    expect(channelRestart).toContain("actionHint: sanitized.actionHint")
    expect(channelRestart).not.toContain("sanitizeUserFacingError(err instanceof Error ? err.message : String(err))")
    expect(channelRestart).not.toContain("const message = err instanceof Error ? err.message : String(err)")
  })
})
