import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { functionParameterTypes } from "./fixtures/typescript-source-contract.ts"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1067 agent AI provider config snapshot", () => {
  it("allows AI provider helpers to receive explicit config snapshots", () => {
    const aiSource = source("packages/core/src/ai/index.ts")

    expect(aiSource).toContain("export type AIProviderConfigSnapshot = Pick<KnowbeeConfig, \"ai\">")
    expect(aiSource).toContain("getActiveAIConnection(config: AIProviderConfigSnapshot)")
    expect(functionParameterTypes(aiSource, "resolveProviderResolutionSnapshot")[0]).toEqual(["string | undefined", "AIProviderConfigSnapshot"])
    expect(functionParameterTypes(aiSource, "detectAvailableProvider")[0]).toEqual(["AIProviderConfigSnapshot"])
    expect(functionParameterTypes(aiSource, "getDefaultModel")[0]).toEqual(["AIProviderConfigSnapshot"])
    expect(functionParameterTypes(aiSource, "inferProviderId")[0]).toEqual(["string", "AIProviderConfigSnapshot"])
    expect(functionParameterTypes(aiSource, "getProvider")[0]).toEqual(["string | undefined", "AIProviderConfigSnapshot"])
    expect(functionParameterTypes(aiSource, "shouldForceReasoningMode")[0]).toEqual(["string", "string", "AIProviderConfigSnapshot"])
    expect(aiSource).not.toContain("getConfig()")
  })

  it("passes one config snapshot through the main agent runtime provider decisions", () => {
    const agentSource = source("packages/core/src/agent/index.ts")

    expect(agentSource).toContain("config: KnowbeeConfig")
    expect(agentSource).toContain("const config = params.config")
    expect(agentSource).not.toContain("params.config ?? getConfig()")
    expect(agentSource).toContain("const model = params.model ?? getDefaultModel(config)")
    expect(agentSource).toContain("const resolvedProviderId = params.providerId ?? detectAvailableProvider(config)")
    expect(agentSource).toContain("const provider = params.provider ?? getProvider(resolvedProviderId, config)")
    expect(agentSource).toContain("shouldForceReasoningMode(resolvedProviderId, model, config)")
  })

  it("passes the same config snapshot through intake and completion review provider decisions", () => {
    const intakeSource = source("packages/core/src/agent/intake.ts")
    const completionReviewSource = source("packages/core/src/agent/completion-review.ts")

    expect(intakeSource).toContain("const model = params.model ?? getDefaultModel(config)")
    expect(intakeSource).toContain("const providerId = detectAvailableProvider(config)")
    expect(intakeSource).toContain("const provider = getProvider(providerId, config)")
    expect(completionReviewSource).toContain("config: KnowbeeConfig")
    expect(completionReviewSource).toContain("const config = params.config")
    expect(completionReviewSource).toContain("const model = params.model ?? getDefaultModel(config)")
    expect(completionReviewSource).toContain("const providerId = params.providerId ?? detectAvailableProvider(config)")
    expect(completionReviewSource).toContain("const provider = params.provider ?? getProvider(providerId, config)")
  })
})
