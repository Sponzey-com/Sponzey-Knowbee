import { describe, expect, it } from "vitest"
import type { ProviderAuditTrace } from "../packages/core/src/ai/index.ts"
import { resolveStartResponseRuntime } from "../packages/core/src/runs/start.ts"

const providerTrace: ProviderAuditTrace = {
  source: "config.ai.connection",
  requestedProviderId: "",
  providerId: "openai",
  adapterType: "openai_codex_oauth",
  baseUrlClass: "chatgpt_codex",
  modelId: "gpt-5.4",
  authType: "chatgpt_oauth",
  configured: true,
  healthy: true,
  fallbackReason: null,
  diagnosticId: "test-provider-trace",
}

describe("resolveStartResponseRuntime", () => {
  it("uses the provider resolution trace when callers omit configured defaults", () => {
    expect(resolveStartResponseRuntime({ providerTrace })).toEqual({
      model: "gpt-5.4",
      providerId: "openai",
    })
  })

  it("keeps explicit run arguments ahead of configured defaults", () => {
    expect(resolveStartResponseRuntime({
      requestedModel: "explicit-model",
      requestedProviderId: "explicit-provider",
      providerTrace,
    })).toEqual({
      model: "explicit-model",
      providerId: "explicit-provider",
    })
  })
})
