import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1142 root run startup config required", () => {
  it("requires config at root run and ingress boundaries", () => {
    const start = source("packages/core/src/runs/start.ts")
    const ingress = source("packages/core/src/runs/ingress.ts")

    expect(start).toContain("config: KnowbeeConfig")
    expect(start).toContain("const runtimeConfig = params.config")
    expect(start).not.toContain("const runtimeConfig = getConfig()")
    expect(start).not.toContain('import { getConfig } from "../config/index.js"')
    expect(ingress).toContain("startRootRun({ ...resolved, inboundMessage })")
  })

  it("passes one snapshot from API and channel ingress", () => {
    const runsRoute = source("packages/core/src/api/routes/runs.ts")
    const telegram = source("packages/core/src/channels/telegram/bot.ts")
    const slack = source("packages/core/src/channels/slack/bot.ts")

    expect(runsRoute).toContain("config: runtimeConfig")
    expect(telegram).toContain("config: runtimeConfig")
    expect(slack).toContain("config: runtimeConfig")
  })

  it("passes parent config into nested and delayed root runs", () => {
    const driver = source("packages/core/src/runs/start-driver-dependencies.ts")
    const orchestration = source("packages/core/src/runs/orchestration-dispatch.ts")

    expect(driver).toContain("config: params.config")
    expect(driver).not.toContain("startRootRun: params.startNestedRootRun")
    expect(orchestration).toContain("config: dependencies.config")
  })
})
