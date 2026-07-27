import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1044 scheduler tool context config boundary", () => {
  it("builds scheduled tool context from an explicit config input", () => {
    const source = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")
    const start = source.indexOf("function buildToolContext")
    const end = source.indexOf("async function executeToolTask", start)
    const helperSource = source.slice(start, end)

    expect(helperSource).toContain("config: KnowbeeConfig")
    expect(helperSource).toContain("workDir: params.config.profile.workspace")
    expect(helperSource).not.toContain("getConfig()")
    expect(source).toContain("buildToolContext({")
    expect(source).toContain("config,")
  })
})
