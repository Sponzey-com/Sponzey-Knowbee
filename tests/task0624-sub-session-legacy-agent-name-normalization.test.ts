import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  new URL("../packages/core/src/orchestration/sub-session-runner.ts", import.meta.url),
  "utf-8",
)

describe("task0624 sub-session agent name boundary", () => {
  it("uses only explicit agentName inputs for sub-session name snapshots", () => {
    expect(source).toContain("return normalizeOptionalAgentName(agent.agentName)")
    expect(source).toContain("return normalizeOptionalAgentName(input.parentAgent?.agentName)")
    expect(source).not.toContain("function legacyAgentNameValue")
    expect(source).not.toContain("record.nickname")
    expect(source).not.toContain("record.displayName")
  })

  it("does not reintroduce legacy output fields in sub-session contracts", () => {
    expect(source).not.toContain("parentAgentNickname")
    expect(source).not.toContain("agentNickname")
    expect(source).not.toContain("parentAgentDisplayName")
    expect(source).not.toContain("agentDisplayName")
  })
})
