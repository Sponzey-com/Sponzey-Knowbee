import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1134 orchestration mode config required", () => {
  it("requires explicit config for sync and async mode resolution", () => {
    const source = readFileSync("packages/core/src/orchestration/mode.ts", "utf-8")

    expect(source).toContain("config: OrchestrationModeConfigSnapshot")
    expect(source).toContain("const config = dependencies.config.orchestration")
    expect(source).not.toContain("import { getConfig,")
    expect(source).not.toContain("getConfig?: () => OrchestrationModeConfigSnapshot")
    expect(source).not.toContain("resolveOrchestrationModeConfig")
    expect(source).not.toContain("Dependencies = {}")
  })

  it("requires start plan and launch to carry the runtime snapshot", () => {
    const startPlan = readFileSync("packages/core/src/runs/start-plan.ts", "utf-8")
    const startLaunch = readFileSync("packages/core/src/runs/start-launch.ts", "utf-8")

    expect(startPlan).toContain("config: OrchestrationModeConfigSnapshot")
    expect(startPlan).toContain("config: params.config")
    expect(startLaunch).toContain("config: OrchestrationModeConfigSnapshot")
    expect(startLaunch).toContain("config: params.config")
  })
})
