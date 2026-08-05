import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0534 root run agent name type boundary", () => {
  it("keeps RootRun free of legacy display name fields", () => {
    const source = readFileSync("packages/core/src/runs/types.ts", "utf8")
    const rootRunMatch = source.match(/export interface RootRun \{([\s\S]*?)\n\}/)

    expect(rootRunMatch?.[1]).toContain("agentName?: string")
    expect(rootRunMatch?.[1]).toContain("agentNameSnapshot?: string")
    expect(rootRunMatch?.[1]).not.toContain("agentDisplayName")
    expect(rootRunMatch?.[1]).not.toContain("agentNickname")
  })
})
