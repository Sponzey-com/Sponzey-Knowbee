import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0604 scheduler error redaction", () => {
  it("keeps scheduler index catch results behind schedulerErrorMessage", () => {
    const source = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")

    expect(source).toContain("function schedulerErrorMessage(error: unknown): string")
    expect(source).toContain("return redactLogText(raw)")
    expect(source).not.toContain("err instanceof Error ? err.message : String(err)")
  })
})
