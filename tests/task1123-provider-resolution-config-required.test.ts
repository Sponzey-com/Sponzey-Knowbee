import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { functionParameterTypes } from "./fixtures/typescript-source-contract.ts"

describe("task1123 provider resolution config boundary", () => {
  it("requires provider resolution snapshots to receive an explicit config snapshot", () => {
    const aiSource = readFileSync("packages/core/src/ai/index.ts", "utf-8")
    const aiProviderConfigTestSource = readFileSync("tests/ai-provider-config.test.ts", "utf-8")
    const providerCapabilityTestSource = readFileSync("tests/task008-provider-capability.test.ts", "utf-8")

    expect(functionParameterTypes(aiSource, "resolveProviderResolutionSnapshot")).toEqual([[
      "string | undefined",
      "AIProviderConfigSnapshot",
    ]])
    expect(functionParameterTypes(aiSource, "detectAvailableProvider")).toEqual([[
      "AIProviderConfigSnapshot",
    ]])
    expect(functionParameterTypes(aiSource, "getDefaultModel")).toEqual([[
      "AIProviderConfigSnapshot",
    ]])
    expect(aiSource).not.toContain("getConfig()")
    expect(aiSource).not.toContain("resolveProviderResolutionSnapshot(providerId?: string, config: AIProviderConfigSnapshot = getConfig())")
    expect(aiProviderConfigTestSource).not.toContain("resolveProviderResolutionSnapshot())")
    expect(providerCapabilityTestSource).toContain("resolveProviderResolutionSnapshot(undefined, config)")
  })
})
