import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1139 agent and intake config required", () => {
  it("requires explicit config at both agent entry points", () => {
    const agent = readFileSync("packages/core/src/agent/index.ts", "utf-8")
    const intake = readFileSync("packages/core/src/agent/intake.ts", "utf-8")

    expect(agent).toContain("config: KnowbeeConfig")
    expect(agent).toContain("const config = params.config")
    expect(agent).not.toContain('from "../config/index.js"')
    expect(agent).not.toContain("params.config ?? getConfig()")

    expect(intake).toContain("config: KnowbeeConfig")
    expect(intake).toContain("const config = params.config")
    expect(intake).not.toContain('from "../config/index.js"')
    expect(intake).not.toContain("params.config ?? getConfig()")
  })

  it("passes config through execution and intake bridges", () => {
    const execution = readFileSync("packages/core/src/runs/execution-runtime.ts", "utf-8")
    const intakeBridge = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")

    expect(execution).toContain("config: KnowbeeConfig")
    expect(execution).toContain("config: params.config")
    expect(intakeBridge).toContain("config: KnowbeeConfig")
    expect(intakeBridge).toContain("config: params.config")
    expect(intakeBridge).not.toContain("...(params.config ? { config: params.config } : {})")
  })
})
