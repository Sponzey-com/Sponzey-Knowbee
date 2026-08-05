import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1044 scheduler tool context config boundary", () => {
  it("builds scheduled tool context from an explicit config input", () => {
    const source = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")
    expect(source).toContain("config: KnowbeeConfig")
    expect(source).toContain("const start = params.dependencies?.startIngressRunImpl ?? startIngressRun")
    expect(source).toContain("config: params.config")
    expect(source).not.toContain("getConfig()")
  })
})
