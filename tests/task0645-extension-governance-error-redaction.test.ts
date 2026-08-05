import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const extensionGovernanceSource = readFileSync(
  new URL("../packages/core/src/security/extension-governance.ts", import.meta.url),
  "utf-8",
)

describe("task0645 extension governance error redaction", () => {
  it("summarizes extension failures through a redacted helper", () => {
    expect(extensionGovernanceSource).toContain('import { redactLogText } from "../logger/index.js"')
    expect(extensionGovernanceSource).toContain("function extensionFailureSummary(error: unknown)")
    expect(extensionGovernanceSource).toContain("const sanitized = sanitizeUserFacingError(rawMessage)")
    expect(extensionGovernanceSource).toContain("userMessage: redactLogText(sanitized.userMessage)")
    expect(extensionGovernanceSource).toContain("const sanitized = extensionFailureSummary(input.error)")
    expect(extensionGovernanceSource).not.toContain(
      "sanitizeUserFacingError(input.error instanceof Error ? input.error.message : String(input.error))",
    )
  })
})
