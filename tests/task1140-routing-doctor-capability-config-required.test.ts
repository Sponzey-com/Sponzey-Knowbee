import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1140 routing, doctor, capability config required", () => {
  it("requires an explicit config snapshot for route resolution and diagnostics", () => {
    const routing = source("packages/core/src/runs/routing.ts")
    const doctor = source("packages/core/src/diagnostics/doctor.ts")

    expect(routing).toContain("resolveRunRoute(input: RouteActionInput, config: KnowbeeConfig)")
    expect(routing).not.toContain("config: KnowbeeConfig = getConfig()")
    expect(routing).not.toContain('from "../config/index.js"')

    expect(doctor).toContain("config: KnowbeeConfig")
    expect(doctor).toContain("const config = options.config")
    expect(doctor).not.toContain("options.config ?? getConfig()")
    expect(doctor).not.toContain("import { getConfig")
  })

  it("requires one config snapshot for capability projection", () => {
    const controlPlane = source("packages/core/src/control-plane/index.ts")

    expect(controlPlane).toContain("config: KnowbeeConfig")
    expect(controlPlane).toContain("const config = options.config")
    expect(controlPlane).not.toContain("options.config ?? getConfig()")
    expect(controlPlane).not.toContain("import { getConfig")
  })
})
