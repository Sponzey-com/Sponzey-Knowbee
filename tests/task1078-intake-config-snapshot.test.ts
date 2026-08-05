import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1078 intake config snapshot", () => {
  it("lets intake callers pass explicit runtime config snapshots", () => {
    const intakeSource = readFileSync("packages/core/src/agent/intake.ts", "utf-8")
    const bridgeSource = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")

    expect(intakeSource).toContain("import type { KnowbeeConfig } from \"../config/types.js\"")
    expect(intakeSource).toContain("config: KnowbeeConfig")
    expect(intakeSource).toContain("const config = params.config")
    expect(intakeSource).not.toContain("params.config ?? getConfig()")
    expect(intakeSource).toContain("const maxDelegationTurns = config.orchestration.maxDelegationTurns")
    expect(intakeSource).toContain("const profileContext = buildUserProfilePromptContext(config.profile)")

    expect(bridgeSource).toContain("config: params.config")
    expect(bridgeSource).toContain("config: KnowbeeConfig")
  })
})
