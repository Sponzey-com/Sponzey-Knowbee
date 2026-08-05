import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1145 orchestration API config context", () => {
  it("removes singleton config reads from orchestration routes", () => {
    for (const path of [
      "packages/core/src/api/routes/agent.ts",
      "packages/core/src/api/routes/topologies.ts",
      "packages/core/src/api/routes/command-palette.ts",
    ]) {
      const source = readFileSync(path, "utf-8")
      expect(source).not.toContain("getConfig()")
      expect(source).toContain("getApiRuntimeConfig")
    }
  })

  it("requires explicit config in agent service helpers", () => {
    const source = readFileSync("packages/core/src/api/routes/agent.ts", "utf-8")
    expect(source).toContain("function hierarchyService(config: KnowbeeConfig")
    expect(source).toContain("function agentRegistryService(config: KnowbeeConfig)")
    expect(source).toContain("function teamRegistryService(config: KnowbeeConfig)")
  })
})
