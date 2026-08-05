import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1001 topology projection main-agent label source", () => {
  it("uses central default main-agent naming and role badges instead of product-name literals", () => {
    const source = readFileSync("packages/core/src/orchestration/topology-projection.ts", "utf-8")

    expect(source).toContain("DEFAULT_MAIN_AGENT_NAME_EN")
    expect(source).not.toContain('DEFAULT_TOPOLOGY_MAIN_AGENT_LABEL = "Knowbee"')
    expect(source).not.toMatch(/badges:\s*string\[\]\s*=\s*\[kind === "knowbee" \? "Knowbee" : "SubAgent"\]/u)
    expect(source).toContain('kind === "knowbee" ? "MainAgent" : "SubAgent"')
  })
})
