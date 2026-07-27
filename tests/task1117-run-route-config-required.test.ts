import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1117 run route config boundary", () => {
  it("passes explicit config snapshots into run route resolution", () => {
    const routingSource = readFileSync("packages/core/src/runs/routing.ts", "utf-8")
    const bridgeSource = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")

    expect(routingSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(routingSource).toContain("import type { AIConnectionConfig, KnowbeeConfig } from \"../config/types.js\"")
    expect(routingSource).toContain("export function resolveRunRoute(input: RouteActionInput, config: KnowbeeConfig): ResolvedRunRoute")
    expect(routingSource).toContain("return resolveRunRouteFromDraft(buildSetupDraft(config, null), input)")
    expect(routingSource).not.toContain("return resolveRunRouteFromDraft(buildSetupDraft(), input)")
    expect(bridgeSource).toContain("}, params.config),")
  })
})
