import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1115 primary AI target config boundary", () => {
  it("requires getPrimaryAiTarget callers to pass an explicit config snapshot", () => {
    const controlPlaneSource = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const statusRouteSource = readFileSync("packages/core/src/api/routes/status.ts", "utf-8")

    expect(controlPlaneSource).toContain("export function getPrimaryAiTarget(config: KnowbeeConfig): string | null")
    expect(controlPlaneSource).not.toContain("export function getPrimaryAiTarget(config: KnowbeeConfig = getConfig()): string | null")
    expect(statusRouteSource).toContain("const cfg = getApiRuntimeConfig(req)")
    expect(statusRouteSource).not.toContain("getConfig")
    expect(statusRouteSource).toContain("primaryAiTarget: getPrimaryAiTarget(cfg)")
    expect(statusRouteSource).not.toContain("primaryAiTarget: getPrimaryAiTarget()")
  })
})
