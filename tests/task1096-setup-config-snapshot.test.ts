import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1096 setup config snapshot", () => {
  it("threads explicit config snapshots through setup draft, checks, and model discovery", () => {
    const controlPlaneSource = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const setupRouteSource = readFileSync("packages/core/src/api/routes/setup.ts", "utf-8")
    const settingsRouteSource = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")
    const statusRouteSource = readFileSync("packages/core/src/api/routes/status.ts", "utf-8")

    for (const source of [controlPlaneSource, setupRouteSource, settingsRouteSource, statusRouteSource]) {
      expect(legacyConfigAccesses(source)).toEqual([])
    }
    expect(functionParameterTypes(controlPlaneSource, "buildSetupDraft")).toEqual([[
      "KnowbeeConfig", "SetupPersistencePaths | null",
    ]])
    expect(functionParameterTypes(controlPlaneSource, "createSetupChecks")).toEqual([[
      "KnowbeeConfig", "SetupPersistencePaths",
    ]])
    expect(functionParameterTypes(controlPlaneSource, "saveSetupDraft")).toEqual([[
      "SetupDraft", "SetupState | undefined", "KnowbeeConfig", "SetupPersistencePaths",
    ]])
    expect(functionParameterTypes(settingsRouteSource, "buildSettingsResponse")).toEqual([[
      "KnowbeeConfig", "SetupPersistencePaths",
    ]])
    expect(callArgumentCounts(setupRouteSource, "saveSetupDraft")).toEqual([4])
    expect(callArgumentCounts(settingsRouteSource, "buildSettingsResponse").every((count) => count === 2)).toBe(true)
    expect(callArgumentCounts(statusRouteSource, "getPrimaryAiTarget")).toEqual([1])
  })
})
