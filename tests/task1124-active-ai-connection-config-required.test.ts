import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1124 active AI connection config boundary", () => {
  it("requires active AI connection reads to receive an explicit config snapshot", () => {
    const aiSource = readFileSync("packages/core/src/ai/index.ts", "utf-8")
    const aiRegressionSource = readFileSync("tests/task1067-agent-ai-provider-config-snapshot.test.ts", "utf-8")

    expect(aiSource).toContain("getActiveAIConnection(config: AIProviderConfigSnapshot): AIConnectionConfig")
    expect(aiSource).not.toContain("getActiveAIConnection(config: AIProviderConfigSnapshot = getConfig())")
    expect(aiSource).not.toContain("getConfig")
    expect(aiSource).toContain("const connection = getActiveAIConnection(config)")
    expect(aiRegressionSource).toContain("getActiveAIConnection(config: AIProviderConfigSnapshot)")
  })
})
