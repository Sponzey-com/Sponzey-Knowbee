import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1079 completion review config snapshot", () => {
  it("propagates runtime config snapshots from root runs into completion review", () => {
    const completionSource = source("packages/core/src/agent/completion-review.ts")
    const reviewPassSource = source("packages/core/src/runs/review-pass.ts")
    const reviewCycleSource = source("packages/core/src/runs/review-cycle-pass.ts")
    const executionCycleSource = source("packages/core/src/runs/execution-cycle-pass.ts")
    const rootLoopSource = source("packages/core/src/runs/root-loop.ts")
    const rootLoopTurnSource = source("packages/core/src/runs/root-loop-turn.ts")
    const rootLoopLaunchSource = source("packages/core/src/runs/root-loop-launch.ts")
    const rootLoopPassLaunchSource = source("packages/core/src/runs/root-loop-pass-launch.ts")
    const rootRunDriverSource = source("packages/core/src/runs/root-run-driver.ts")
    const startSource = source("packages/core/src/runs/start.ts")

    expect(completionSource).toContain("config: KnowbeeConfig")
    expect(completionSource).toContain("const config = params.config")
    expect(completionSource).not.toContain("params.config ?? getConfig()")
    expect(reviewPassSource).toContain("review = await dependencies.reviewTaskCompletion")
    expect(reviewPassSource).toContain("config: params.config")
    expect(reviewCycleSource).toContain("config: params.config")
    expect(executionCycleSource).toContain("config: KnowbeeConfig")
    expect(rootLoopSource).toContain("config: KnowbeeConfig")
    expect(rootLoopTurnSource).toContain("config: KnowbeeConfig")
    expect(rootLoopLaunchSource).toContain("config: KnowbeeConfig")
    expect(rootLoopPassLaunchSource).toContain("config: RootLoopParams[\"config\"]")
    expect(rootRunDriverSource).toContain("config: KnowbeeConfig")
    expect(startSource).toContain("config: runtimeConfig")
  })
})
