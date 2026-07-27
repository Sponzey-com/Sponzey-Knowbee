import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const panelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "SubAgentAdvancedSettingsPanel.tsx"),
  "utf-8",
)
const viewModelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "lib", "advanced-sub-agent-settings.ts"),
  "utf-8",
)

describe("task0437 sub-agent memory and monitoring wording", () => {
  it("uses user-facing memory policy labels in the advanced sub-agent panel", () => {
    expect(panelSource).not.toContain("compact threshold")
    expect(panelSource).not.toContain("capsule mode")
    expect(panelSource).not.toContain("session compaction")
    expect(panelSource).not.toContain("rolling summary")
    expect(panelSource).not.toContain("원문 보존 창")
    expect(panelSource).not.toContain("last compact")
    expect(panelSource).not.toContain("capsule 원문")

    expect(panelSource).toContain("기억 압축 기준")
    expect(panelSource).toContain("기억 압축 방식")
    expect(panelSource).toContain("대화 기록 압축")
    expect(panelSource).toContain("최근 대화 유지 범위")
    expect(panelSource).toContain("장기 기억 상세 내용은 기본 화면에 표시하지 않습니다.")
  })

  it("uses product, field debug, and development log wording", () => {
    expect(panelSource).not.toContain("로그 현장 확인")
    expect(panelSource).not.toContain("로그 개발")
    expect(panelSource).not.toContain("로그 최소")
    expect(viewModelSource).not.toContain("log debug")
    expect(viewModelSource).not.toContain("log development")
    expect(viewModelSource).not.toContain("log product")

    expect(panelSource).toContain("현장 확인 로그")
    expect(panelSource).toContain("개발 로그")
    expect(panelSource).toContain("제품 최소 로그")
    expect(viewModelSource).toContain("Field debug log")
    expect(viewModelSource).toContain("Development log")
    expect(viewModelSource).toContain("Product log")
  })

  it("does not use trace-event jargon in monitoring summaries", () => {
    expect(viewModelSource).not.toContain("No trace events yet.")
    expect(viewModelSource).not.toContain("Runtime trace is being checked.")
    expect(viewModelSource).not.toContain("trace events /")
    expect(viewModelSource).not.toContain("session compaction")
    expect(viewModelSource).not.toContain("rolling summary")
    expect(viewModelSource).not.toContain("needs review")
    expect(viewModelSource).not.toContain('return pickUiText(language, "개별 메모리", "private")')
    expect(viewModelSource).not.toContain('return pickUiText(language, "상위 요약 공개", "coordinator visible")')

    expect(viewModelSource).toContain("No run records yet.")
    expect(viewModelSource).toContain("Run records are being checked.")
    expect(viewModelSource).toContain("run records /")
    expect(viewModelSource).toContain("Conversation history compression")
    expect(viewModelSource).toContain("Private memory")
    expect(viewModelSource).toContain("Parent summary visible")
  })
})
