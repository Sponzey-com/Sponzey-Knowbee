import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const setupRouteSource = readFileSync(
  new URL("../packages/core/src/api/routes/setup.ts", import.meta.url),
  "utf-8",
)

describe("task0641 setup route error redaction", () => {
  it("summarizes setup backend test errors through a redacted helper", () => {
    expect(setupRouteSource).toContain('import { redactLogText } from "../../logger/index.js"')
    expect(setupRouteSource).toContain("function setupRouteErrorSummary(error: unknown)")
    expect(setupRouteSource).toContain("return sanitizeUserFacingError(redactLogText(rawMessage))")
    expect(setupRouteSource).toContain("const sanitized = setupRouteErrorSummary(error)")
    expect(setupRouteSource).not.toContain("sanitizeUserFacingError(error instanceof Error ? error.message : String(error))")
  })
})
