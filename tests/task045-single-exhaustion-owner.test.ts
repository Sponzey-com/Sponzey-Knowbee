import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("Task 045 single exhaustion owner", () => {
  it("keeps disconnected resolution-path compatibility modules removed", () => {
    expect(existsSync("packages/core/src/contracts/resolution-path-decision.ts")).toBe(false)
    expect(existsSync("packages/core/src/runs/resolution-path-application.ts")).toBe(false)

    const barrel = readFileSync("packages/core/src/index.ts", "utf8")
    expect(barrel).not.toContain("resolution-path-decision")
    expect(barrel).not.toContain("resolution-path-application")
  })

  it("keeps authorized solution-path exhaustion in the active node runtime", () => {
    const runtime = readFileSync("packages/core/src/topology-runtime/node-runtime.ts", "utf8")
    expect(runtime).toContain("assessAuthorizedSolutionPathExhaustion")
    expect(runtime).toContain("diagnosisAuthorized")
  })
})
