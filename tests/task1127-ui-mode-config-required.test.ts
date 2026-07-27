import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1127 UI mode runtime config boundary", () => {
  it("requires UI mode runtime state to receive an explicit config snapshot", () => {
    const modeSource = readFileSync("packages/core/src/ui/mode.ts", "utf-8")
    const uiRouteSource = readFileSync("packages/core/src/api/routes/ui-mode.ts", "utf-8")
    const adminRouteSource = readFileSync("packages/core/src/api/routes/admin.ts", "utf-8")

    expect(modeSource).not.toContain("import { getConfig, reloadConfig }")
    expect(modeSource).toContain("export type UiModeRuntimeConfigInput = UiModeRuntimeInput & { config: KnowbeeConfig }")
    expect(modeSource).toContain("getUiModeState(input: UiModeRuntimeConfigInput): UiModeState")
    expect(modeSource).toContain("const config = input.config")
    expect(modeSource).not.toContain("const config = input.config ?? getConfig()")
    expect(modeSource).toContain("mode: PreferredUiMode,\n  input: UiModeRuntimeConfigInput,\n  paths: PersistedConfigPaths,")
    expect(uiRouteSource).toContain("return getUiModeState({ ...options, config })")
    expect(uiRouteSource).toContain("savePreferredUiMode(mode, { ...options, config }, paths)")
    expect(adminRouteSource).toContain("mode: getUiModeState({ ...(options.uiModeRuntime ?? {}), config })")
  })
})
