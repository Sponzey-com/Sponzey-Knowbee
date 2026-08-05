import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1068 API AI provider config snapshot", () => {
  it("uses the settings route config snapshot for AI test provider decisions", () => {
    const settingsSource = source("packages/core/src/api/routes/settings.ts")

    expect(settingsSource).toContain("const config = getApiRuntimeConfig(req)")
    expect(settingsSource).toContain("const model = getDefaultModel(config)")
    expect(settingsSource).toContain("const provider = getProvider(undefined, config)")
    expect(settingsSource).toContain("resolveProviderResolutionSnapshot(undefined, config)")
    expect(settingsSource).not.toContain("const model = getDefaultModel()")
    expect(settingsSource).not.toContain("const provider = getProvider()")
  })

  it("uses the status route config snapshot for provider and model status", () => {
    const statusSource = source("packages/core/src/api/routes/status.ts")

    expect(statusSource).toContain("const cfg = getApiRuntimeConfig(req)")
    expect(statusSource).toContain("provider: detectAvailableProvider(cfg)")
    expect(statusSource).toContain("model: getDefaultModel(cfg)")
    expect(statusSource).not.toContain("provider: detectAvailableProvider()")
    expect(statusSource).not.toContain("model: getDefaultModel()")
  })
})
