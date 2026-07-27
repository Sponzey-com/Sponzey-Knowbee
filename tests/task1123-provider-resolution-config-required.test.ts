import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1123 provider resolution config boundary", () => {
  it("requires provider resolution snapshots to receive an explicit config snapshot", () => {
    const aiSource = readFileSync("packages/core/src/ai/index.ts", "utf-8")
    const aiProviderConfigTestSource = readFileSync("tests/ai-provider-config.test.ts", "utf-8")
    const providerCapabilityTestSource = readFileSync("tests/task008-provider-capability.test.ts", "utf-8")

    expect(aiSource).toContain("resolveProviderResolutionSnapshot(providerId: string | undefined, config: AIProviderConfigSnapshot)")
    expect(aiSource).toContain("detectAvailableProvider(config: AIProviderConfigSnapshot)")
    expect(aiSource).toContain("getDefaultModel(config: AIProviderConfigSnapshot)")
    expect(aiSource).not.toContain("getConfig()")
    expect(aiSource).not.toContain("resolveProviderResolutionSnapshot(providerId?: string, config: AIProviderConfigSnapshot = getConfig())")
    expect(aiProviderConfigTestSource).not.toContain("resolveProviderResolutionSnapshot())")
    expect(providerCapabilityTestSource).toContain("resolveProviderResolutionSnapshot(undefined, config)")
  })
})
