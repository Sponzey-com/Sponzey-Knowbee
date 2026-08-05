import { describe, expect, it, vi } from "vitest"

import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import {
  resolveRunLlmRuntime,
  toRunLlmRuntimePreflightFailure,
  type RunLlmRuntimeResolverPort,
} from "../packages/core/src/runs/run-llm-runtime-resolution.ts"

function provider(id: string): AIProvider {
  return {
    id,
    supportedModels: ["model-a"],
    maxContextTokens: () => 16_000,
    async *chat(_params: ChatParams): AsyncGenerator<AIChunk> {},
  }
}

describe("run LLM runtime resolution", () => {
  it("preserves an explicit provider without calling configured resolution", () => {
    const explicit = provider("explicit")
    const resolver: RunLlmRuntimeResolverPort = {
      resolveConfiguredProvider: vi.fn(),
    }

    expect(
      resolveRunLlmRuntime({
        explicitProvider: explicit,
        providerId: "explicit",
        model: "model-a",
        resolver,
      }),
    ).toEqual({
      status: "ready",
      provider: explicit,
      providerId: "explicit",
      model: "model-a",
      source: "explicit",
    })
    expect(resolver.resolveConfiguredProvider).not.toHaveBeenCalled()
  })

  it("resolves a config-only provider once for the whole execution attempt", () => {
    const configured = provider("configured")
    const resolveConfiguredProvider = vi.fn(() => ({
      provider: configured,
      providerId: "configured",
    }))

    expect(
      resolveRunLlmRuntime({
        providerId: "configured",
        model: "model-a",
        resolver: { resolveConfiguredProvider },
      }),
    ).toEqual({
      status: "ready",
      provider: configured,
      providerId: "configured",
      model: "model-a",
      source: "configured",
    })
    expect(resolveConfiguredProvider).toHaveBeenCalledOnce()
    expect(resolveConfiguredProvider).toHaveBeenCalledWith({ providerId: "configured" })
  })

  it("returns distinct closed results for missing inputs and resolver failure", () => {
    const resolver: RunLlmRuntimeResolverPort = {
      resolveConfiguredProvider: () => {
        throw new Error("token=secret")
      },
    }

    expect(
      resolveRunLlmRuntime({ providerId: "configured", model: " ", resolver }),
    ).toEqual({ status: "unavailable", reasonCode: "model_missing" })
    expect(
      resolveRunLlmRuntime({ model: "model-a", resolver }),
    ).toEqual({ status: "unavailable", reasonCode: "provider_missing" })
    expect(
      resolveRunLlmRuntime({ providerId: "configured", model: "model-a", resolver }),
    ).toEqual({ status: "unavailable", reasonCode: "provider_resolution_failed" })
  })

  it("fails closed when the configured provider identity differs from the startup snapshot", () => {
    expect(
      resolveRunLlmRuntime({
        providerId: "configured",
        model: "model-a",
        resolver: {
          resolveConfiguredProvider: () => ({
            provider: provider("configured-adapter"),
            providerId: "different-provider",
          }),
        },
      }),
    ).toEqual({
      status: "unavailable",
      reasonCode: "configured_provider_context_missing",
    })
  })

  it("maps infrastructure and invariant failures before canonical planning", () => {
    expect(
      toRunLlmRuntimePreflightFailure({
        status: "unavailable",
        reasonCode: "provider_resolution_failed",
      }),
    ).toMatchObject({
      code: "ai_connection_unavailable",
      eventLabel: "preflight_failed: provider_resolution_failed",
    })
    expect(
      toRunLlmRuntimePreflightFailure({
        status: "unavailable",
        reasonCode: "configured_provider_context_missing",
      }),
    ).toMatchObject({
      code: "ai_connection_unavailable",
      eventLabel: "preflight_failed: configured_provider_context_missing",
    })
    expect(
      toRunLlmRuntimePreflightFailure({
        status: "unavailable",
        reasonCode: "model_missing",
      }),
    ).toBeNull()
  })
})
