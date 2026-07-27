import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1133 execution graph config required", () => {
  it("requires one explicit graph config without singleton or callback fallback", () => {
    const source = readFileSync("packages/core/src/orchestration/execution-graph-snapshot.ts", "utf-8")

    expect(source).toContain("config: ExecutionGraphConfigSnapshot")
    expect(source).toContain("const cfg = input.config")
    expect(source).toContain("config: input.config")
    expect(source).not.toContain("import { getConfig,")
    expect(source).not.toContain("getConfig?: () => ExecutionGraphConfigSnapshot")
    expect(source).not.toContain("resolveExecutionGraphConfig")
    expect(source).not.toContain("BuildExecutionGraphSnapshotInput = {}")
  })

  it("requires the execution decision boundary to pass the same config", () => {
    const decision = readFileSync("packages/core/src/orchestration/decide-execution-route.ts", "utf-8")
    const intake = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")

    expect(decision).toContain("config: ExecutionGraphConfigSnapshot")
    expect(decision).toContain("config: input.config")
    expect(intake).toContain("if (!params.config) throw new Error(\"execution graph runtime config is required\")")
  })
})
