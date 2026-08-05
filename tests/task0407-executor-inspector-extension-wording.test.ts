import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "ExecutorInspector.tsx"),
  "utf-8",
)

describe("task0407 executor inspector extension wording", () => {
  it("uses work ability and external feature wording in sub-agent summaries", () => {
    expect(source).not.toContain("Skill/MCP: {summary.skillMcpLabel}")
    expect(source).toContain('text("작업 능력/외부 기능", "Work abilities/external features")')
    expect(source).toContain("}: {summary.skillMcpLabel}")
  })
})
