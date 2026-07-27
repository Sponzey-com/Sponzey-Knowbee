import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "TopologyPage.tsx"), "utf-8")

describe("task0416 topology capability label wording", () => {
  it("uses work ability and external feature labels in agent capability details", () => {
    expect(source).not.toContain('text("Skill", "Skills")')
    expect(source).not.toContain('text("MCP", "MCP")')
    expect(source).not.toContain('text("도구", "Tools")')

    expect(source).toContain('text("작업 능력", "Work abilities")')
    expect(source).toContain('text("외부 기능", "External features")')
    expect(source).toContain('text("외부 도구", "External tools")')
    expect(source).toContain("agent.skillMcp.enabledSkillIds")
    expect(source).toContain("agent.skillMcp.enabledMcpServerIds")
    expect(source).toContain("agent.tools.enabledToolNames")
  })
})
