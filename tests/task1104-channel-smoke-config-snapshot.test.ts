import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1104 channel smoke config snapshot", () => {
  it("captures request config once before running persisted channel smoke scenarios", () => {
    const source = readFileSync("packages/core/src/api/routes/channel-smoke.ts", "utf-8")

    expect(source).toMatch(
      /const config = getApiRuntimeConfig\(req\)[\s\S]{0,160}runPersistedChannelSmokeScenarios\(\{\s*config,/,
    )
    expect(source).not.toContain("getConfig")
    expect(source).not.toContain("config: getConfig()")
  })
})
