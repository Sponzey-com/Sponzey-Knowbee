import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1062 provider resolution config snapshot callers", () => {
  it("uses existing config snapshots for provider resolution traces", () => {
    const settingsSource = source("packages/core/src/api/routes/settings.ts")
    const startSource = source("packages/core/src/runs/start.ts")

    expect(settingsSource).toContain("resolveProviderResolutionSnapshot(undefined, config)")
    expect(startSource).toContain("resolveProviderResolutionSnapshot(params.providerId, runtimeConfig)")
    expect(startSource).toContain("connection: runtimeConfig.ai.connection")
    expect(startSource).toContain("memory: runtimeConfig.memory")
    expect(startSource).not.toContain("const cfg = getConfig()")
    expect(startSource).not.toContain("resolveProviderResolutionSnapshot(params.providerId)")
  })
})
