import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("Task 035 root queue terminal boundary", () => {
  it("binds queue admission rejection to the existing LLM-rendered failure finalizer", () => {
    const source = readFileSync("packages/core/src/runs/start.ts", "utf8")
    const handler = source.slice(source.indexOf("onAdmissionRejected:"))

    expect(handler).toContain('code: "execution_queue_full"')
    expect(handler).toContain("buildStartPreflightResponseContext")
    expect(handler).toContain("return failStartPreflight")
    expect(handler).toContain("onChunk: effectiveOnChunk")
  })
})
