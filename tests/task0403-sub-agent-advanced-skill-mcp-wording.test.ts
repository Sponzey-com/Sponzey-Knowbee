import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const panelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "SubAgentAdvancedSettingsPanel.tsx"),
  "utf-8",
)

const kindLabelStart = panelSource.indexOf("function skillMcpKindLabel(")
const kindLabelEnd = panelSource.indexOf("function monitoringLogLevelLabel(", kindLabelStart)
const labelSource = panelSource.slice(kindLabelStart, kindLabelEnd)

const editorStart = panelSource.indexOf("function SkillMcpBindingEditor(")
const editorEnd = panelSource.indexOf("function MemoryPolicyEditor(", editorStart)
const editorSource = panelSource.slice(editorStart, editorEnd)

describe("task0403 sub-agent advanced skill mcp wording", () => {
  it("uses user-facing labels for capability and external feature kinds", () => {
    expect(labelSource).not.toContain('return "MCP 서버"')
    expect(labelSource).not.toContain('return "MCP 도구"')
    expect(labelSource).not.toContain('return "기능"')

    expect(labelSource).toContain('return "작업 능력"')
    expect(labelSource).toContain('return "외부 기능 연결"')
    expect(labelSource).toContain('return "외부 도구"')
    expect(labelSource).toContain("function skillMcpFilterLabel")
  })

  it("uses user-facing labels in the sub-agent connection editor", () => {
    expect(panelSource).not.toContain('label="기능/MCP"')
    expect(editorSource).not.toContain("기능/MCP 연결")
    expect(editorSource).not.toContain('placeholder="Skill, MCP, tool 검색"')
    expect(editorSource).not.toContain("표시할 Skill/MCP 항목이 없습니다.")
    expect(editorSource).not.toContain("기능/MCP 저장")

    expect(panelSource).toContain('label="작업 능력/외부 기능"')
    expect(editorSource).toContain("작업 능력/외부 기능 연결")
    expect(editorSource).toContain('placeholder="작업 능력, 외부 기능, 도구 검색"')
    expect(editorSource).toContain("skillMcpFilterLabel(id)")
    expect(editorSource).toContain("표시할 작업 능력/외부 기능 항목이 없습니다.")
    expect(editorSource).toContain("작업 능력/외부 기능 저장")
  })
})
