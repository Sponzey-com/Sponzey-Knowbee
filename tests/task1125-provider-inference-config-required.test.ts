import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1125 provider inference config boundary", () => {
  it("requires provider inference to receive an explicit config snapshot", () => {
    const aiSource = readFileSync("packages/core/src/ai/index.ts", "utf-8")
    const aiRegressionSource = readFileSync("tests/task1067-agent-ai-provider-config-snapshot.test.ts", "utf-8")

    expect(aiSource).toContain("inferProviderId(_model: string, config: AIProviderConfigSnapshot): string")
    expect(aiSource).toContain("return detectAvailableProvider(config)")
    expect(aiSource).not.toContain("inferProviderId(_model: string, config?: AIProviderConfigSnapshot)")
    expect(aiRegressionSource).toContain('functionParameterTypes(aiSource, "inferProviderId")')
    expect(aiRegressionSource).toContain('["string", "AIProviderConfigSnapshot"]')
  })
})
