import { describe, expect, it } from "vitest"

import { buildSettingsAiConnectionTestConfig } from "../packages/core/src/api/settings-ai-connection-test-config.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"

describe("settings AI connection test config", () => {
  it("builds an ephemeral explicit connection without mutating the runtime snapshot", () => {
    const base = structuredClone(DEFAULT_CONFIG)
    const candidate = buildSettingsAiConnectionTestConfig(base, {
      providerType: "openai",
      authMode: "chatgpt_oauth",
      endpoint: "https://api.openai.com/v1",
      defaultModel: "gpt-5",
      credentials: { oauthAuthFilePath: "~/.codex/auth.json" },
    })

    expect(candidate.ai.connection).toEqual({
      provider: "openai",
      model: "gpt-5",
      endpoint: "https://api.openai.com/v1",
      auth: {
        mode: "chatgpt_oauth",
        oauthAuthFilePath: "~/.codex/auth.json",
      },
    })
    expect(base.ai.connection).toEqual(DEFAULT_CONFIG.ai.connection)
  })

  it("inherits a saved credential only for the same provider and auth mode", () => {
    const base = structuredClone(DEFAULT_CONFIG)
    base.ai.connection = {
      provider: "openai",
      model: "gpt-5.4",
      endpoint: "https://api.openai.com/v1",
      auth: { mode: "api_key", apiKey: "saved-secret" },
    }

    expect(buildSettingsAiConnectionTestConfig(base, {
      providerType: "openai",
      authMode: "api_key",
      endpoint: "https://api.openai.com/v1",
      defaultModel: "custom-model",
      credentials: {},
    }).ai.connection.auth?.apiKey).toBe("saved-secret")

    expect(buildSettingsAiConnectionTestConfig(base, {
      providerType: "anthropic",
      authMode: "api_key",
      endpoint: "https://api.anthropic.com",
      defaultModel: "claude-sonnet-4-5",
      credentials: {},
    }).ai.connection.auth?.apiKey).toBeUndefined()
  })

  it("rejects a test request without an explicit provider or model", () => {
    expect(() => buildSettingsAiConnectionTestConfig(DEFAULT_CONFIG, {
      providerType: "openai",
      authMode: "api_key",
      endpoint: "https://api.openai.com/v1",
      defaultModel: " ",
      credentials: {},
    })).toThrow("ai_test_model_required")
  })
})
