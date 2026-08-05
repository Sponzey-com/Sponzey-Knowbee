import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0489 sub-session agentName input boundary", () => {
  it("keeps RunSubSessionInput agent snapshots free of displayName and nickname", () => {
    const source = readFileSync("packages/core/src/orchestration/sub-session-runner.ts", "utf8")
    const runtimeMatch = source.match(/export interface SubSessionRuntimeAgentSnapshot \{([\s\S]*?)\n\}/)
    const parentMatch = source.match(/export interface SubSessionParentAgentSnapshot \{([\s\S]*?)\n\}/)

    expect(runtimeMatch?.[1]).toContain("agentName: string")
    expect(runtimeMatch?.[1]).not.toContain("displayName")
    expect(runtimeMatch?.[1]).not.toContain("nickname")
    expect(parentMatch?.[1]).toContain("agentName?: string")
    expect(parentMatch?.[1]).not.toContain("displayName")
    expect(parentMatch?.[1]).not.toContain("nickname")
  })

  it("validates spawn input by agentName instead of displayName", () => {
    const source = readFileSync("packages/core/src/orchestration/sub-session-control.ts", "utf8")

    expect(source).toContain("!trimmedString(input.agent.agentName)")
    expect(source).not.toContain("!trimmedString(input.agent.displayName)")
  })

  it("builds feedback redelegation input with agentName-only agent snapshots", () => {
    const source = readFileSync("packages/core/src/orchestration/feedback-loop.ts", "utf8")
    const parentAgentMatch = source.match(/parentAgent: \{([\s\S]*?)\n    \}/)
    const agentMatch = source.match(/agent: \{([\s\S]*?)\n    \}/)

    expect(parentAgentMatch?.[1]).toContain("agentName:")
    expect(parentAgentMatch?.[1]).not.toContain("displayName")
    expect(parentAgentMatch?.[1]).not.toContain("parentAgentDisplayName")
    expect(agentMatch?.[1]).toContain("agentName:")
    expect(agentMatch?.[1]).not.toContain("displayName")
  })
})
