import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const inspectorSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyWorkspaceInspector.tsx"),
  "utf-8",
)
const canvasSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "EnterpriseTopologyCanvas.tsx"),
  "utf-8",
)

describe("task0412 topology workspace user wording", () => {
  it("uses user-facing resource setting labels", () => {
    expect(inspectorSource).not.toContain('text("Tool 설정", "Tool settings")')
    expect(inspectorSource).not.toContain('text("Data 설정", "Data settings")')
    expect(inspectorSource).not.toContain('text("Tool picker", "Tool picker")')
    expect(inspectorSource).not.toContain('text("System picker", "System picker")')
    expect(inspectorSource).not.toContain('text("Permission mode", "Permission mode")')
    expect(inspectorSource).not.toContain('text("Retry preset", "Retry preset")')
    expect(inspectorSource).not.toContain('text("Timeout preset", "Timeout preset")')
    expect(inspectorSource).not.toContain('text("Task 설정", "Task settings")')
    expect(inspectorSource).not.toContain('text("Template picker", "Template picker")')
    expect(inspectorSource).not.toContain('text("Output preset", "Output preset")')
    expect(inspectorSource).not.toContain('text("긴 instruction", "Long instruction")')
    expect(inspectorSource).not.toContain('text("Raw contract, JSON, YAML 편집은 이 고급 영역에서만 다룹니다.", "Raw contract, JSON, and YAML editing belongs only in this advanced area.")')
    expect(inspectorSource).not.toContain('text("선택 Inspector", "Selection Inspector")')

    expect(inspectorSource).toContain('text("외부 도구 설정", "External tool settings")')
    expect(inspectorSource).toContain('text("데이터 설정", "Data settings")')
    expect(inspectorSource).toContain('text("외부 도구 선택", "External tool selection")')
    expect(inspectorSource).toContain('text("데이터 선택", "Data selection")')
    expect(inspectorSource).toContain('text("권한 방식", "Permission mode")')
    expect(inspectorSource).toContain('text("재시도 설정", "Retry preset")')
    expect(inspectorSource).toContain('text("제한 시간 설정", "Timeout preset")')
    expect(inspectorSource).toContain('text("업무 설정", "Work settings")')
    expect(inspectorSource).toContain('text("업무 유형 선택", "Work type selection")')
    expect(inspectorSource).toContain('text("결과 형식", "Result format")')
    expect(inspectorSource).toContain('text("상세 지시", "Detailed instruction")')
    expect(inspectorSource).toContain('text("내부 계약, JSON, YAML 편집은 이 고급 영역에서만 다룹니다.", "Internal contract, JSON, and YAML editing belongs only in this advanced area.")')
    expect(inspectorSource).toContain('text("선택 항목", "Selected item")')
  })

  it("uses start point wording instead of node and entry wording", () => {
    expect(canvasSource).not.toContain('text("Run Target", "Run Target")')
    expect(canvasSource).not.toContain('text("업무 node를 선택합니다.", "Select a work node.")')
    expect(canvasSource).not.toContain('text("선택 node를 Entry로 지정", "Set selected node as entry")')

    expect(canvasSource).toContain('text("실행 시작점", "Run start point")')
    expect(canvasSource).toContain('text("업무 항목을 선택합니다.", "Select a work item.")')
    expect(canvasSource).toContain('text("선택 항목을 시작점으로 지정", "Set selected item as start point")')
  })
})
