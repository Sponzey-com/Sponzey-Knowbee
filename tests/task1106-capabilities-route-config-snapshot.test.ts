import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1106 capabilities route config snapshot", () => {
  it("centralizes capabilities response construction around an explicit config snapshot", () => {
    const source = readFileSync("packages/core/src/api/routes/capabilities.ts", "utf-8")

    expect(source).toContain("import { getApiRuntimeConfig } from \"../runtime-context.js\"")
    expect(source).not.toContain("getConfig()")
    expect(source).toContain("function buildCapabilitiesResponse(options: CapabilitiesRouteOptions, config: KnowbeeConfig)")
    expect(source).toContain("items: createCapabilities({ ...options, config })")
    expect(source).toContain("orchestration: resolveOrchestrationModeSnapshotSync({ config })")
    expect(source).toContain("return buildCapabilitiesResponse(options, config)")
    expect(source).toContain("const item = buildCapabilitiesResponse(options, config).items.find")
    expect(source).not.toContain("createCapabilities({ ...options, config }).find")
  })
})
