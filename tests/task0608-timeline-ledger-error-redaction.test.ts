import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0608 timeline and ledger degraded diagnostic redaction", () => {
  it("redacts degraded diagnostic summaries before persistence", () => {
    const timeline = readFileSync("packages/core/src/control-plane/timeline.ts", "utf-8")
    const ledger = readFileSync("packages/core/src/runs/message-ledger.ts", "utf-8")

    expect(timeline).toContain("function controlTimelineProjectionErrorMessage(error: unknown): string")
    expect(ledger).toContain("function messageLedgerErrorMessage(error: unknown): string")
    expect(timeline).toContain("const message = controlTimelineProjectionErrorMessage(error)")
    expect(ledger).toContain("const message = messageLedgerErrorMessage(error)")
    expect(timeline).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(ledger).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(timeline).not.toContain("control event projection failed: ${error instanceof Error ? error.message : String(error)}")
    expect(ledger).not.toContain("message ledger write failed: ${error instanceof Error ? error.message : String(error)}")
  })
})
