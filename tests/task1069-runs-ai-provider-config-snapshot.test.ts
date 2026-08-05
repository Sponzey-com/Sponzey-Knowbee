import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1069 runs AI provider config snapshot", () => {
  it("passes runtime config into start preflight context planning", () => {
    const startSource = source("packages/core/src/runs/start.ts")
    const preflightSource = source("packages/core/src/runs/preflight.ts")

    expect(startSource).toContain("config: runtimeConfig")
    expect(preflightSource).toContain("config?: AIProviderConfigSnapshot")
    expect(preflightSource).toContain("detectAvailableProvider(input.config)")
    expect(preflightSource).toContain("getDefaultModel(input.config)")
  })

  it("passes AI config snapshot through start driver and intake bridge", () => {
    const driverSource = source("packages/core/src/runs/start-driver-dependencies.ts")
    const bridgeSource = source("packages/core/src/runs/start-bridges.ts")
    const intakeBridgeSource = source("packages/core/src/runs/intake-bridge-pass.ts")

    expect(driverSource).toContain("type StartRootRunDriverRuntimeConfig = KnowbeeConfig")
    expect(driverSource).toContain("config: params.config")
    expect(bridgeSource).toContain("config: KnowbeeConfig")
    expect(intakeBridgeSource).toContain("config?: AIProviderConfigSnapshot")
    expect(intakeBridgeSource).toContain("detectAvailableProvider(input.config)")
    expect(intakeBridgeSource).toContain("getProvider(providerId, input.config)")
    expect(intakeBridgeSource).toContain("getDefaultModel(input.config)")
    expect(intakeBridgeSource).toContain("config: params.config")
  })
})
