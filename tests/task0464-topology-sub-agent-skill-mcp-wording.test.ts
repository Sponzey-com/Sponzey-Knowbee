import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0464 topology sub-agent skill/MCP wording", () => {
  it("uses work ability and external feature wording in topology sub-agent summary labels", () => {
    const source = readFileSync("packages/webui/src/lib/topology-sub-agent-sync.ts", "utf8")

    expect(source).not.toContain("공통 Skill/MCP 사용")
    expect(source).not.toContain('"Skill/MCP"')
    expect(source).toContain("공통 작업 능력/외부 기능 사용")
  })
})
