import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const configOperationsSource = readFileSync(
  new URL("../packages/core/src/config/operations.ts", import.meta.url),
  "utf-8",
)

describe("task0643 config operation rollback error redaction", () => {
  it("summarizes rollback validation errors through a redacted helper", () => {
    expect(configOperationsSource).toContain('import { redactLogText } from "../logger/index.js"')
    expect(configOperationsSource).toContain("function configOperationRollbackErrorSummary(error: unknown)")
    expect(configOperationsSource).toContain("return sanitizeUserFacingError(redactLogText(rawMessage))")
    expect(configOperationsSource).toContain("const sanitized = configOperationRollbackErrorSummary(error)")
    expect(configOperationsSource).not.toContain("sanitizeUserFacingError(error instanceof Error ? error.message : String(error))")
  })
})
