import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const configOperationsRouteSource = readFileSync(
  new URL("../packages/core/src/api/routes/config-operations.ts", import.meta.url),
  "utf-8",
)

describe("task0638 config operation error redaction", () => {
  it("summarizes config operation route errors through a redacted helper", () => {
    expect(configOperationsRouteSource).toContain('import { logger, redactLogText } from "../../logger/index.js"')
    expect(configOperationsRouteSource).toContain("function configOperationErrorSummary(error: unknown)")
    expect(configOperationsRouteSource).toContain("return sanitizeUserFacingError(redactLogText(rawMessage))")
    expect(configOperationsRouteSource).toContain("const sanitized = configOperationErrorSummary(error)")
    expect(configOperationsRouteSource).not.toContain("sanitizeUserFacingError(error instanceof Error ? error.message : String(error))")
  })
})
