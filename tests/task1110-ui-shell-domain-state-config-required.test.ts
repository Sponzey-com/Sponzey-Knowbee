import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1110 UI shell domain state config boundary", () => {
  it("requires callers to pass a config snapshot into UI shell domain state construction", () => {
    const source = readFileSync("packages/core/src/api/routes/ui-mode.ts", "utf-8")

    expect(source).toContain("import type { KnowbeeConfig } from \"../../config/index.js\"")
    expect(source).toContain("function buildUiShellDomainState(options: UiModeRouteOptions, config: KnowbeeConfig, paths: RuntimePaths)")
    expect(source).toContain("const config = getApiRuntimeConfig(req)\n    const shell = buildUiShellDomainState(options, config, getApiRuntimePaths(req))")
    expect(source).not.toContain("getConfig")
    expect(source).not.toContain("function buildUiShellDomainState(options: UiModeRouteOptions, config = getConfig())")
    expect(source).not.toContain("function buildUiShellDomainState(options: UiModeRouteOptions, config: KnowbeeConfig = getConfig())")
  })
})
