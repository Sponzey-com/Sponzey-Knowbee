import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const runtimeInspectorSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "lib", "runtime-inspector.ts"),
  "utf-8",
)
const runtimePanelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "runs", "RunRuntimeInspectorPanel.tsx"),
  "utf-8",
)

describe("task0417 runtime inspector user wording", () => {
  it("labels diagnostic executor identifiers as internal", () => {
    expect(runtimeInspectorSource).not.toContain('text("현재 서브 에이전트 ID", "Current sub-agent ID")')
    expect(runtimeInspectorSource).not.toContain('text("판단 후보 ID", "Candidate executor IDs")')
    expect(runtimeInspectorSource).not.toContain('text("전체 등록 서브 에이전트 ID", "All registered sub-agent IDs")')
    expect(runtimeInspectorSource).not.toContain('text("선택 서브 에이전트 ID", "Selected sub-agent ID")')
    expect(runtimeInspectorSource).not.toContain('text("선택 경로 ID", "Selected path IDs")')

    expect(runtimeInspectorSource).toContain('text("현재 내부 식별자", "Current internal identifier")')
    expect(runtimeInspectorSource).toContain('text("판단 후보 내부 식별자", "Candidate internal identifiers")')
    expect(runtimeInspectorSource).toContain('text("등록된 내부 식별자", "Registered internal identifiers")')
    expect(runtimeInspectorSource).toContain('text("선택된 내부 식별자", "Selected internal identifier")')
    expect(runtimeInspectorSource).toContain('text("선택 경로 내부 식별자", "Selected path internal identifiers")')
  })

  it("uses external tool and connection wording in runtime panels", () => {
    expect(runtimePanelSource).not.toContain('text("도구 실행", "Tool execution")')
    expect(runtimePanelSource).not.toContain('text("서브 에이전트", "sub-agents")')
    expect(runtimePanelSource).not.toContain('text("연결", "edges")')
    expect(runtimePanelSource).not.toContain('text("실패", "failures")')
    expect(runtimePanelSource).not.toContain('text("서브 에이전트 ID", "Sub-agent IDs")')

    expect(runtimePanelSource).toContain('text("외부 도구 실행", "External tool execution")')
    expect(runtimePanelSource).toContain('text("서브 에이전트 실행", "sub-agent runs")')
    expect(runtimePanelSource).toContain('text("연결", "connections")')
    expect(runtimePanelSource).toContain('text("실패 항목", "failures")')
    expect(runtimePanelSource).toContain('text("진단용 내부 식별자", "Diagnostic internal identifiers")')
  })
})
