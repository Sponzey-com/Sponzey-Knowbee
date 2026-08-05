import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const promptSourcesRouteSource = readFileSync(
  new URL("../packages/core/src/api/routes/prompt-sources.ts", import.meta.url),
  "utf-8",
)

describe("task0637 prompt source route error redaction", () => {
  it("summarizes prompt source route errors through a redacted helper", () => {
    expect(promptSourcesRouteSource).toContain('import { redactLogText } from "../../logger/index.js"')
    expect(promptSourcesRouteSource).toContain("function promptSourceRouteErrorSummary(error: unknown)")
    expect(promptSourcesRouteSource).toContain("return sanitizeUserFacingError(redactLogText(rawMessage))")
    expect(promptSourcesRouteSource).toContain("const sanitized = promptSourceRouteErrorSummary(error)")
    expect(promptSourcesRouteSource).not.toContain("sanitizeUserFacingError(error instanceof Error ? error.message : String(error))")
    expect(promptSourcesRouteSource).not.toContain("const sanitized = sanitizeUserFacingError(error.message)")
  })
})
