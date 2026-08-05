import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0605 scheduler contract executor error redaction", () => {
  it("redacts contract executor catch errors before results and receipts", () => {
    const source = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")

    expect(source).toContain("function scheduleContractErrorMessage(error: unknown): string")
    expect(source).toContain("return redactLogText(raw)")
    expect(source).not.toContain("const message = error instanceof Error ? error.message : String(error)")
    expect(source).not.toContain("errorMsg = error instanceof Error ? error.message : String(error)")
  })
})
