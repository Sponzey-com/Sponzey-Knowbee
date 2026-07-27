import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1091 execution graph config snapshot", () => {
  it("threads explicit config snapshots into execution graph construction", () => {
    const graphSource = readFileSync("packages/core/src/orchestration/execution-graph-snapshot.ts", "utf-8")
    const decisionSource = readFileSync("packages/core/src/orchestration/decide-execution-route.ts", "utf-8")
    const intakeSource = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")

    expect(graphSource).toContain("export type ExecutionGraphConfigSnapshot = Pick<KnowbeeConfig, \"orchestration\"> & Partial<Pick<KnowbeeConfig, \"ai\">>")
    expect(graphSource).toContain("config: ExecutionGraphConfigSnapshot")
    expect(graphSource).toContain("const cfg = input.config")
    expect(graphSource).toContain("config: input.config")
    expect(graphSource).not.toContain("getConfig?: () => ExecutionGraphConfigSnapshot")
    expect(graphSource).not.toContain("resolveExecutionGraphConfig")

    expect(decisionSource).toContain("type ExecutionGraphConfigSnapshot")
    expect(decisionSource).toContain("config: ExecutionGraphConfigSnapshot")
    expect(decisionSource).toContain("config: input.config")
    expect(intakeSource).toContain("config: params.config,\n        buildExecutionGraphSnapshot")
  })
})
