import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1135 agent hierarchy config required", () => {
  it("requires one explicit config snapshot in the hierarchy service", () => {
    const source = readFileSync("packages/core/src/orchestration/hierarchy.ts", "utf-8")

    expect(source).toContain("config: AgentHierarchyConfigSnapshot")
    expect(source).toContain("const config = dependencies.config")
    expect(source).toContain("createAgentRegistryService({ ...dependencies, config })")
    expect(source).not.toContain("PATHS, getConfig")
    expect(source).not.toContain("configFromDependencies")
    expect(source).not.toContain("dependencies.getConfig?.()")
    expect(source).not.toContain("AgentHierarchyServiceDependencies = {}")
  })

  it("passes the runtime snapshot through hierarchy callers", () => {
    const route = readFileSync("packages/core/src/api/routes/agent.ts", "utf-8")
    const composition = readFileSync(
      "packages/core/src/orchestration/team-composition.ts",
      "utf-8",
    )
    const topology = readFileSync(
      "packages/core/src/orchestration/topology-projection.ts",
      "utf-8",
    )

    expect(route).toContain("config: getApiRuntimeConfig(req)")
    expect(route).toContain("createAgentHierarchyStorage(app.knowbeeRuntimeContext.paths)")
    expect(route).toContain("createAgentHierarchyService({\n    config,\n    storage,")
    expect(composition).toContain("config: AgentHierarchyConfigSnapshot")
    expect(composition).toContain("createAgentHierarchyService({ ...dependencies, config })")
    expect(topology).toContain("config: AgentHierarchyConfigSnapshot")
    expect(topology).toContain("createAgentHierarchyService({ ...dependencies, config })")
  })
})
