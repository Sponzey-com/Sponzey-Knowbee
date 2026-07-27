import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0613 migration error redaction", () => {
  it("redacts migration exceptions before failing migration locks", () => {
    const source = readFileSync("packages/core/src/db/migrations.ts", "utf-8")
    const failure = source.slice(
      source.indexOf("failMigrationLock(db"),
      source.indexOf("throw error", source.indexOf("failMigrationLock(db")),
    )

    expect(source).toContain("function migrationErrorMessage(error: unknown): string")
    expect(source).toContain("const message = migrationErrorMessage(error)")
    expect(failure).toContain("error: message")
    expect(failure).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(failure).not.toContain("error: error instanceof Error ? error.message : String(error)")
  })
})
