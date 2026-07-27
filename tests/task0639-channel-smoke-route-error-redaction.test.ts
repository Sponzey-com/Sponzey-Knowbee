import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const channelSmokeRouteSource = readFileSync(
  new URL("../packages/core/src/api/routes/channel-smoke.ts", import.meta.url),
  "utf-8",
)

describe("task0639 channel smoke route error redaction", () => {
  it("summarizes channel smoke route errors through a redacted helper", () => {
    expect(channelSmokeRouteSource).toContain('import { redactLogText } from "../../logger/index.js"')
    expect(channelSmokeRouteSource).toContain("function channelSmokeRouteErrorSummary(error: unknown)")
    expect(channelSmokeRouteSource).toContain("return sanitizeUserFacingError(redactLogText(rawMessage))")
    expect(channelSmokeRouteSource).toContain("const sanitized = channelSmokeRouteErrorSummary(error)")
    expect(channelSmokeRouteSource).not.toContain("sanitizeUserFacingError(error instanceof Error ? error.message : String(error))")
  })
})
