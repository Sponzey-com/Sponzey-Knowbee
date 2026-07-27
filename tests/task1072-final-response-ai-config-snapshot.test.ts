import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1072 final response AI config snapshot", () => {
  it("uses required AI config snapshots in the final response renderer", () => {
    const rendererSource = source("packages/core/src/runs/final-response-renderer.ts")

    expect(rendererSource).not.toContain("../config/index.js")
    expect(rendererSource).not.toContain("getConfig(")
    expect(rendererSource).toContain("config: AIProviderConfigSnapshot")
    expect(rendererSource).toContain("getProvider(providerId, input.config)")
  })

  it("passes scheduler config snapshots into scheduled final response rendering", () => {
    const finalResponseSource = source("packages/core/src/scheduler/final-response.ts")
    const schedulerSource = source("packages/core/src/scheduler/index.ts")
    const contractExecutorSource = source("packages/core/src/scheduler/contract-executor.ts")

    expect(finalResponseSource).toContain("config: AIProviderConfigSnapshot")
    expect(finalResponseSource).toContain("getDefaultModel(params.config)")
    expect(finalResponseSource).toContain("getProvider(undefined, params.config)")
    expect(finalResponseSource).toContain("config: params.config")
    expect(schedulerSource).toContain("config,")
    expect(contractExecutorSource).toContain("config,")
  })
})
