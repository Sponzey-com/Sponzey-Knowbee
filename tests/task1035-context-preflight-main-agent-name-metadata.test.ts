import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task1035 context preflight main-agent name metadata", () => {
  it("passes the resolved main-agent name snapshot from main agent response generation", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/agent/index.ts"), "utf-8")

    expect(source).toContain("const mainAgentSelfName = resolveMainAgentSelfName(config, promptLocale)")
    expect(source).toMatch(/metadata:\s*\{[\s\S]*?mainAgentNameSnapshot:\s*mainAgentSelfName[\s\S]*?operation:\s*"agent_round"/u)
  })

  it("passes the resolved main-agent name snapshot from task intake diagnosis", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/agent/intake.ts"), "utf-8")

    expect(source).toContain("const mainAgentSelfName = resolveMainAgentSelfName(config, promptLocale)")
    expect(source).toMatch(/metadata:\s*\{[\s\S]*?mainAgentNameSnapshot:\s*mainAgentSelfName[\s\S]*?operation:\s*repair\s*\?\s*"task_intake_schema_repair"\s*:\s*"task_intake"/u)
  })
})
