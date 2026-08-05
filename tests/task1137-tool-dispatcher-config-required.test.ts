import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1137 tool dispatcher config required", () => {
  it("keeps the dispatcher class independent from config singletons", () => {
    const source = readFileSync("packages/core/src/tools/dispatcher.ts", "utf-8")

    expect(source).toContain("config: ToolRuntimeConfigSnapshot")
    expect(source).toContain("private readonly config: ToolRuntimeConfigSnapshot")
    expect(source).toContain("constructor(dependencies: ToolDispatcherDependencies)")
    expect(source).toContain("this.config = dependencies.config")
    expect(source).toContain("buildRuntimeToolContext({")
    expect(source).not.toContain("getConfig")
    expect(source).not.toContain("ToolDispatcherDependencies = {}")
    expect(source).not.toContain("dependencies.getConfig")
  })

  it("requires config initialization from the runtime composition root", () => {
    const source = readFileSync("packages/core/src/tools/runtime-dispatcher.ts", "utf-8")

    expect(source).toContain("export function initializeToolDispatcher(")
    expect(source).toContain("new ToolDispatcher({ config, ...dependencies })")
    expect(source).not.toContain("getConfig")
  })
})
