import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0601 instruction discovery error redaction", () => {
  it("redacts instruction file read errors before source diagnostics", () => {
    const source = readFileSync("packages/core/src/instructions/discovery.ts", "utf-8")
    const picker = source.slice(
      source.indexOf("function pickInstructionFile"),
      source.indexOf("function normalizeAgentSources"),
    )

    expect(source).toContain("function instructionDiscoveryErrorMessage(error: unknown): string")
    expect(picker).toContain("const message = instructionDiscoveryErrorMessage(error)")
    expect(picker).toContain("error: message")
    expect(picker).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(picker).not.toContain("error: error instanceof Error ? error.message : String(error)")
  })
})
