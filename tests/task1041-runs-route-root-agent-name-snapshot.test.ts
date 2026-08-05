import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1041 runs route root agent name snapshot", () => {
  it("uses an explicit runtime config snapshot for runtime inspector root name", () => {
    const source = readFileSync("packages/core/src/api/routes/runs.ts", "utf-8")

    expect(source).not.toContain("resolveMainAgentSelfName(getConfig())")
    expect(source).toContain("const runtimeConfig = getApiRuntimeConfig(req)")
    expect(source).toContain("const rootAgentNameSnapshot = resolveMainAgentSelfName(runtimeConfig)")
    expect(source).toContain("rootAgentNameSnapshot,")
  })
})
