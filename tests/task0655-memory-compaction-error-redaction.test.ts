import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0655 memory compaction error redaction", () => {
  it("redacts provider call errors through a named helper before recording attempts", () => {
    const source = readFileSync("packages/core/src/memory/compaction.ts", "utf-8")
    const compaction = source.slice(
      source.indexOf("for await (const chunk of input.provider.chat"),
      source.indexOf("const parsed = parseRootSessionStructuredSummary"),
    )

    expect(source).toContain("function memoryCompactionErrorMessage(error: unknown): string")
    expect(compaction).toContain("const message = memoryCompactionErrorMessage(error)")
    expect(compaction).toContain("error: message")
    expect(compaction).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(compaction).not.toContain("error: error instanceof Error ? error.message : String(error)")
  })
})
