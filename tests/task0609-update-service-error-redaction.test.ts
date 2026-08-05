import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0609 update service error redaction", () => {
  it("redacts update check errors before persisted snapshot messages", () => {
    const source = readFileSync("packages/core/src/update/service.ts", "utf-8")
    const catchBlock = source.slice(
      source.indexOf('log.error("update check failed", error)'),
      source.indexOf("return writeStoredSnapshot(snapshot)", source.indexOf('log.error("update check failed", error)')),
    )

    expect(source).toContain("function updateServiceErrorMessage(error: unknown): string")
    expect(catchBlock).toContain("const message = updateServiceErrorMessage(error)")
    expect(catchBlock).toContain("message,")
    expect(catchBlock).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(catchBlock).not.toContain("message: error instanceof Error ? error.message : String(error)")
  })
})
