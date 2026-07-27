import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1093 agent hierarchy config snapshot", () => {
  it("requires hierarchy services to use only an explicit config snapshot", () => {
    const source = readFileSync("packages/core/src/orchestration/hierarchy.ts", "utf-8")

    expect(source).toContain("export type AgentHierarchyConfigSnapshot = Pick<{ orchestration: OrchestrationConfig }, \"orchestration\">")
    expect(source).toContain("config: AgentHierarchyConfigSnapshot")
    expect(source).toContain("const config = dependencies.config")
    expect(source).not.toContain("configFromDependencies")
    expect(source).not.toContain("dependencies.getConfig?.()")
    expect(source).not.toContain("getConfig()")
  })
})
