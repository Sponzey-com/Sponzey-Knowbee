import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0610 backup rehearsal error redaction", () => {
  it("redacts SQLite integrity check errors before report messages", () => {
    const source = readFileSync("packages/core/src/config/backup-rehearsal.ts", "utf-8")
    const integrityCheck = source.slice(
      source.indexOf("function checkSqliteIntegrity"),
      source.indexOf("function buildRestoreReport"),
    )

    expect(source).toContain("function backupRehearsalErrorMessage(error: unknown): string")
    expect(integrityCheck).toContain("message: backupRehearsalErrorMessage(error)")
    expect(integrityCheck).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(integrityCheck).not.toContain("message: error instanceof Error ? error.message : String(error)")
  })
})
