import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1095 start plan orchestration config snapshot", () => {
  it("threads runtime config snapshots from start launch into orchestration mode resolution", () => {
    const startPlanSource = readFileSync("packages/core/src/runs/start-plan.ts", "utf-8")
    const startLaunchSource = readFileSync("packages/core/src/runs/start-launch.ts", "utf-8")
    const startSource = readFileSync("packages/core/src/runs/start.ts", "utf-8")

    expect(startPlanSource).toContain("type OrchestrationModeConfigSnapshot")
    expect(startPlanSource).toContain("config: OrchestrationModeConfigSnapshot")
    expect(startPlanSource).toContain("config: params.config")

    expect(startLaunchSource).toContain("import type { OrchestrationModeConfigSnapshot } from \"../orchestration/mode.js\"")
    expect(startLaunchSource).toContain("config: OrchestrationModeConfigSnapshot")
    expect(startLaunchSource).toContain("config: params.config")

    expect(startSource).toContain("config: runtimeConfig,")
    expect(startSource).toContain("hasRequestGroupExecutionQueue,")
  })
})
