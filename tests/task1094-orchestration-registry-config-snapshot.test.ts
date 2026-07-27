import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1094 orchestration registry config snapshot", () => {
  it("requires registry snapshots to use only explicit config snapshots", () => {
    const registrySource = readFileSync("packages/core/src/orchestration/registry.ts", "utf-8")
    const graphSource = readFileSync("packages/core/src/orchestration/execution-graph-snapshot.ts", "utf-8")

    expect(registrySource).toContain("config: RegistryConfigSnapshot")
    expect(registrySource).toContain("const config = dependencies.config")
    expect(registrySource).toContain("const cfg = input.config")
    expect(registrySource).not.toContain("getConfig?:")
    expect(registrySource).not.toContain("dependencies.getConfig?.()")
    expect(registrySource).not.toContain("getConfig()")

    expect(graphSource).toContain("return buildOrchestrationRegistrySnapshot({\n    ...input.registryDependencies,\n    config: input.config,")
    expect(graphSource).not.toContain("configProvider")
  })
})
