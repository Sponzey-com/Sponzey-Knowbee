import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1071 contract comparison AI config snapshot", () => {
  it("uses optional AI config snapshots in active run continuation comparison", () => {
    const entrySource = source("packages/core/src/runs/entry-comparison.ts")

    expect(entrySource).toContain("type AIProviderConfigSnapshot")
    expect(entrySource).toContain("config?: AIProviderConfigSnapshot")
    expect(entrySource).toContain("getDefaultModel(params.config)")
    expect(entrySource).toContain("detectAvailableProvider(params.config)")
    expect(entrySource).toContain("getProvider(providerId, params.config)")
  })

  it("uses optional AI config snapshots in schedule contract comparison", () => {
    const scheduleSource = source("packages/core/src/schedules/comparison.ts")

    expect(scheduleSource).toContain("type AIProviderConfigSnapshot")
    expect(scheduleSource).toContain("config?: AIProviderConfigSnapshot")
    expect(scheduleSource).toContain("getDefaultModel(params.config)")
    expect(scheduleSource).toContain("detectAvailableProvider(params.config)")
    expect(scheduleSource).toContain("getProvider(providerId, params.config)")
  })
})
