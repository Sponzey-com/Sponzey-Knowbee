import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1138 AI provider helper config required", () => {
  it("requires explicit config in all provider helpers", () => {
    const source = readFileSync("packages/core/src/ai/index.ts", "utf-8")

    expect(source).toContain("detectAvailableProvider(config: AIProviderConfigSnapshot)")
    expect(source).toContain("getDefaultModel(config: AIProviderConfigSnapshot)")
    expect(source).toContain("getProvider(providerId: string | undefined, config: AIProviderConfigSnapshot)")
    expect(source).toContain("shouldForceReasoningMode(providerId: string, model: string, config: AIProviderConfigSnapshot)")
    expect(source).not.toContain('from "../config/index.js"')
    expect(source).not.toContain("getConfig()")
    expect(source).not.toContain("config ??")
  })

  it("passes config when default rendering helpers are selected", () => {
    const telegram = readFileSync("packages/core/src/channels/telegram/commands.ts", "utf-8")
    const notice = readFileSync("packages/core/src/runs/user-facing-notice-rendering.ts", "utf-8")

    expect(telegram).toContain("getDefaultModel(config)")
    expect(telegram).toContain("getProvider(undefined, config)")
    expect(notice).toContain("getDefaultModel(explicitConfig)")
    expect(notice).toContain("getProvider(undefined, explicitConfig)")
  })
})
