import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1192 capability owner boundary", () => {
  it("uses the core capability contract as the WebUI DTO source", () => {
    const source = readFileSync("packages/webui/src/contracts/capabilities.ts", "utf-8")

    expect(source).toContain('from "@knowbee/core"')
    expect(source).not.toContain("interface FeatureCapability")
    expect(source).not.toContain("type CapabilityStatus =")
  })

  it("does not define UI-local capability availability fallbacks", () => {
    const source = readFileSync("packages/webui/src/components/FeatureGate.tsx", "utf-8")

    expect(source).not.toContain("FEATURE_GATE_FALLBACKS")
    expect(source).toContain("if (!capability)")
  })

  it("keeps API and status projections on the same application owner", () => {
    const capabilitiesRoute = readFileSync("packages/core/src/api/routes/capabilities.ts", "utf-8")
    const statusRoute = readFileSync("packages/core/src/api/routes/status.ts", "utf-8")

    expect(capabilitiesRoute).toContain("createCapabilities({ ...options, config })")
    expect(statusRoute).toContain("createCapabilities({ ...capabilityOptions, config: cfg })")
    expect(statusRoute).toContain("createCapabilityCounts({ ...capabilityOptions, config: cfg })")
  })
})
