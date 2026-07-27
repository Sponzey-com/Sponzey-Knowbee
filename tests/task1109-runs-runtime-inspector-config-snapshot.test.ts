import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1109 runs runtime inspector config snapshot", () => {
  it("builds runtime inspector responses from an explicit route config snapshot", () => {
    const source = readFileSync("packages/core/src/api/routes/runs.ts", "utf-8")

    expect(source).toContain("import { getApiRuntimeConfig } from \"../runtime-context.js\"")
    expect(source).toContain("import type { RootRun } from \"../../runs/types.js\"")
    expect(source).toContain("function buildRuntimeInspectorResponse(run: RootRun, runtimeConfig: KnowbeeConfig)")
    expect(source).toContain("const rootAgentNameSnapshot = resolveMainAgentSelfName(runtimeConfig)")
    expect(source).toContain("const runtimeConfig = getApiRuntimeConfig(req)\n      return buildRuntimeInspectorResponse(run, runtimeConfig)")
    expect(source).not.toContain("return {\n        projection: buildRunRuntimeInspectorProjection(run, {\n          rootAgentNameSnapshot,")
    expect(source).not.toContain("resolveMainAgentSelfName(getConfig())")
    expect(source).not.toContain("getConfig()")
  })
})
