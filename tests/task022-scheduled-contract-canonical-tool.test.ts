import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task022 scheduled contract canonical tool", () => {
  it("removes dispatcher and tool policy ownership from the contract executor", () => {
    const source = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf8")

    expect(source).not.toContain("toolDispatcher")
    expect(source).not.toContain("ToolContext")
    expect(source).not.toContain("ToolResult")
    expect(source).not.toContain("dispatchTool")
    expect(source).not.toContain("executeToolTask")
    expect(source).toContain("result: await executeCanonicalTask")
    expect(source).toContain("deliverTelegramFile?:")
  })
})
