import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1136 orchestration registry config required", () => {
  it("requires and captures one explicit config snapshot", () => {
    const source = readFileSync("packages/core/src/orchestration/registry.ts", "utf-8")

    expect(source).toContain("config: RegistryConfigSnapshot")
    expect(source).toContain("const config = dependencies.config")
    expect(source).toContain("buildOrchestrationRegistrySnapshotUnsafe({ config, dependencies, startedAt, clock })")
    expect(source).not.toContain("type KnowbeeConfig, type OrchestrationConfig, getConfig")
    expect(source).not.toContain("getConfig?:")
    expect(source).not.toContain("dependencies.getConfig?.()")
    expect(source).not.toContain("RegistryServiceDependencies = {}")
  })

  it("passes captured config from planner, dispatch, and API boundaries", () => {
    const planner = readFileSync("packages/core/src/orchestration/planner.ts", "utf-8")
    const dispatch = readFileSync("packages/core/src/runs/orchestration-dispatch.ts", "utf-8")
    const route = readFileSync("packages/core/src/api/routes/agent.ts", "utf-8")

    expect(planner).toContain("buildOrchestrationRegistrySnapshot({ config: input.config, now })")
    expect(dispatch).toContain("buildOrchestrationRegistrySnapshot({ config: dependencies.config })")
    expect(route).toContain("function agentRegistryService(config: KnowbeeConfig)")
    expect(route).toContain("createAgentRegistryService({ config })")
    expect(route).toContain("function teamRegistryService(config: KnowbeeConfig)")
    expect(route).toContain("createTeamRegistryService({ config })")
    expect(route).toContain("agentRegistryService(getApiRuntimeConfig(req))")
    expect(route).not.toContain("getConfig")
  })
})
