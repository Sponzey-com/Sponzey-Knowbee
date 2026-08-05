import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1090 UI mode config snapshot", () => {
  it("threads explicit config snapshots through UI mode state and shell routes", () => {
    const modeSource = readFileSync("packages/core/src/ui/mode.ts", "utf-8")
    const routeSource = readFileSync("packages/core/src/api/routes/ui-mode.ts", "utf-8")

    expect(modeSource).toContain("import type { KnowbeeConfig } from \"../config/types.js\"")
    expect(modeSource).toContain("config?: KnowbeeConfig")
    expect(modeSource).toContain("export type UiModeRuntimeConfigInput = UiModeRuntimeInput & { config: KnowbeeConfig }")
    expect(modeSource).toContain("getUiModeState(input: UiModeRuntimeConfigInput): UiModeState")
    expect(modeSource).toContain("const config = input.config")
    expect(modeSource).not.toContain("const config = input.config ?? getConfig()")
    expect(modeSource).not.toContain("reloadConfig()")
    expect(modeSource).toContain("preferredUiMode: mode")
    expect(modeSource).toContain("return getUiModeState({ ...input, config })")

    expect(routeSource).toContain("export interface UiModeRouteOptions extends Omit<UiModeRuntimeInput, \"config\"> {}")
    expect(routeSource).toContain("function buildUiShellDomainState(options: UiModeRouteOptions, config: KnowbeeConfig, paths: RuntimePaths)")
    expect(routeSource).toContain("const modeOptions = { ...options, config }")
    expect(routeSource).toContain("mode: getUiModeState(modeOptions)")
    expect(routeSource).toContain("return getUiModeState({ ...options, config })")
    expect(routeSource).toContain("const shell = buildUiShellDomainState(options, config, getApiRuntimePaths(req))")
    expect(routeSource).toContain("savePreferredUiMode(mode, { ...options, config }, paths)")
    expect(routeSource).toContain("const config = getApiRuntimeConfig(req)")
  })
})
