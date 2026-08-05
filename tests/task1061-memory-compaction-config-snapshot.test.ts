import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1061 memory compaction config snapshot", () => {
  it("resolves compaction model policy from explicit memory config input", () => {
    const policySource = source("packages/core/src/memory/model-policy.ts")
    const compactionSource = source("packages/core/src/memory/compaction.ts")
    const preflightSource = source("packages/core/src/runs/context-preflight.ts")
    const agentSource = source("packages/core/src/agent/index.ts")

    expect(policySource).not.toContain("getConfig()")
    expect(policySource).not.toContain("../config/index.js")
    expect(policySource).toContain("memoryConfig?: MemoryConfig")
    expect(policySource).toContain("input.memoryConfig?.compaction?.modelId")
    expect(compactionSource).toContain("memoryConfig?: MemoryConfig")
    expect(compactionSource).toContain("memoryConfig: input.memoryConfig")
    expect(preflightSource).toContain("memoryConfig?: MemoryConfig")
    expect(preflightSource).toContain("memoryConfig: input.memoryConfig")
    expect(agentSource).toContain("memoryConfig: config.memory")
  })
})
