import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createAgentPublicRef as canonicalRef } from "../packages/core/src/agents/agent-public-reference.js"
import { createAgentPublicRef as compatibilityRef } from "../packages/core/src/capabilities/agent-public-reference.js"

describe("Task 039 agent public reference ownership", () => {
  it("keeps one canonical implementation without changing existing refs", () => {
    expect(compatibilityRef("agent:research")).toBe(canonicalRef("agent:research"))
    expect(compatibilityRef("agent:research")).toMatch(/^agent_v1_[a-f0-9]{24}$/u)
    const compatibilitySource = readFileSync(
      "packages/core/src/capabilities/agent-public-reference.ts",
      "utf8",
    )
    expect(compatibilitySource).not.toContain("createHash")
    expect(compatibilitySource).toContain("../agents/agent-public-reference.js")
  })
})
