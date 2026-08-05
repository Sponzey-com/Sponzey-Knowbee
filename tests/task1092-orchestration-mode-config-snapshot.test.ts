import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callObjectPropertyInitializers,
  functionParameterTypes,
  interfacePropertyTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1092 orchestration mode config snapshot", () => {
  it("threads explicit config snapshots through orchestration mode and capability projections", () => {
    const modeSource = readFileSync("packages/core/src/orchestration/mode.ts", "utf-8")
    const controlPlaneSource = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const capabilitiesRouteSource = readFileSync("packages/core/src/api/routes/capabilities.ts", "utf-8")
    const statusRouteSource = readFileSync("packages/core/src/api/routes/status.ts", "utf-8")

    for (const source of [modeSource, controlPlaneSource, capabilitiesRouteSource, statusRouteSource]) {
      expect(legacyConfigAccesses(source)).toEqual([])
    }
    expect(interfacePropertyTypes(modeSource, "ResolveOrchestrationModeSyncDependencies").config).toBe("OrchestrationModeConfigSnapshot")
    expect(interfacePropertyTypes(controlPlaneSource, "CapabilityProjectionOptions").config).toBe("KnowbeeConfig")
    expect(functionParameterTypes(controlPlaneSource, "createCapabilities")).toEqual([[
      "CapabilityProjectionOptions",
    ]])
    expect(callObjectPropertyInitializers(capabilitiesRouteSource, "createCapabilities").every(
      (properties) => properties.config === "config",
    )).toBe(true)
    expect(callObjectPropertyInitializers(statusRouteSource, "createCapabilities")).toEqual([
      expect.objectContaining({ config: "cfg" }),
    ])
  })
})
