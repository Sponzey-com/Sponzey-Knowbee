import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task1034 root-session compaction agent name injection", () => {
  it("keeps compaction independent from singleton config name lookup", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/memory/compaction.ts"), "utf-8")

    expect(source).not.toContain("getConfig")
    expect(source).not.toContain("resolveMainAgentSelfName")
    expect(source).toContain("agentNameSnapshot: input.agentNameSnapshot")
  })
})
