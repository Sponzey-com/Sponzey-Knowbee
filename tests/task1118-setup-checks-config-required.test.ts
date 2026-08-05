import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1118 setup checks config boundary", () => {
  it("requires setup check callers to pass an explicit config snapshot", () => {
    const controlPlaneSource = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const setupRouteSource = readFileSync("packages/core/src/api/routes/setup.ts", "utf-8")
    const settingsRouteSource = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")

    expect(controlPlaneSource).toContain("export function createSetupChecks(config: KnowbeeConfig, paths: SetupPersistencePaths): SetupChecks")
    expect(controlPlaneSource).not.toContain("export function createSetupChecks(config: KnowbeeConfig = getConfig()): SetupChecks")
    expect(controlPlaneSource).not.toContain("export function createSetupChecks(): SetupChecks {\n  const config = getConfig()")
    expect(setupRouteSource).toContain("const config = getApiRuntimeConfig(req)\n    return redactSetupChecksForApi(createSetupChecks(config, getApiRuntimePaths(req)))")
    expect(settingsRouteSource).toContain("checks: redactSetupChecksForApi(createSetupChecks(config, paths))")
    expect(settingsRouteSource).toContain("checks: redactSetupChecksForApi(createSetupChecks(currentConfig, paths))")
    expect(settingsRouteSource).not.toContain("createSetupChecks()")
  })
})
