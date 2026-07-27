import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1055 orchestration registry model config snapshot", () => {
  it("uses the registry build config snapshot for inherited model profile", () => {
    const source = readFileSync("packages/core/src/orchestration/registry.ts", "utf-8")

    expect(source).not.toContain("config.ai?.connection ?? getConfig().ai.connection")
    expect(source).toContain("function runtimeConfigModelProfile(config: Partial<Pick<KnowbeeConfig, \"ai\">>): ModelProfile | undefined")
    expect(source).toContain("const connection = config.ai?.connection")
    expect(source).toContain("if (!connection) return undefined")
    expect(source).toContain("const cfg = input.config")
    expect(source).not.toContain("dependencies.getConfig")
    expect(source).toContain("const inheritedModelProfile = runtimeConfigModelProfile(cfg)")
  })
})
