import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0994 channel finalizer default-name source", () => {
  it("uses the identity module as the only default main-agent name source", () => {
    const source = readFileSync("packages/core/src/runs/channel-finalizer.ts", "utf-8")

    expect(source).toContain("DEFAULT_MAIN_AGENT_NAME_KO")
    expect(source).toContain("agentName: DEFAULT_MAIN_AGENT_NAME_KO")
    expect(source).toContain("agentNameSnapshot: DEFAULT_MAIN_AGENT_NAME_KO")
    expect(source).not.toContain("../config/index.js")
    expect(source).not.toContain("getConfig(")
    expect(source).not.toContain('agentName: "노비"')
    expect(source).not.toContain('agentNameSnapshot: "노비"')
  })
})
