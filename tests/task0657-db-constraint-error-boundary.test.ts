import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0657 DB constraint error boundary", () => {
  it("uses a named helper for DB constraint error message checks", () => {
    const source = readFileSync("packages/core/src/db/index.ts", "utf-8")

    expect(source).toContain("function dbConstraintErrorMessage(error: unknown): string")
    expect(source).toContain("const message = dbConstraintErrorMessage(error)")
    expect(source).toContain('message.includes("message_ledger")')
    expect(source).toContain('message.includes("orchestration_events")')
    expect(source).not.toContain("const message = error instanceof Error ? error.message : String(error)")
  })
})
