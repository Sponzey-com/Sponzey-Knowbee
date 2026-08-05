import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0658 local bridge error helper", () => {
  it("separates raw error extraction from receipt redaction", () => {
    const source = readFileSync("packages/core/src/channels/local-bridge/adapter.ts", "utf-8")
    const helper = source.slice(
      source.indexOf("function localBridgeErrorMessage"),
      source.indexOf("export interface LocalBridgeDoctorIssue"),
    )

    expect(helper).toContain("const raw = error instanceof Error ? error.message : String(error)")
    expect(helper).toContain("return redactLocalBridgeReceiptMessage(raw)")
    expect(helper).not.toContain("return redactLocalBridgeReceiptMessage(error instanceof Error ? error.message : String(error))")
  })
})
