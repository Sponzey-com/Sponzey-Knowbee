import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const advancedSettingsSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "lib", "advanced-settings.ts"), "utf-8")
const reviewSummarySource = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "setup", "ReviewSummaryPanel.tsx"), "utf-8")
const paletteSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "topology", "EnterpriseTopologyPalette.tsx"), "utf-8")

describe("task0426 settings helper label wording", () => {
  it("uses user-facing Korean descriptions in advanced settings tabs", () => {
    expect(advancedSettingsSource).not.toContain("단일 AI provider, endpoint")
    expect(advancedSettingsSource).not.toContain("capability, 재연결")
    expect(advancedSettingsSource).not.toContain("메모리 scope, writeback")

    expect(advancedSettingsSource).toContain("단일 AI 연결 종류, 연결 주소")
    expect(advancedSettingsSource).toContain("사용 가능 기능, 재연결")
    expect(advancedSettingsSource).toContain("메모리 영역, 장기 기억 반영 후보")
  })

  it("uses user-facing labels in setup review summary", () => {
    expect(reviewSummarySource).not.toContain('text("Readiness Board", "Readiness Board")')
    expect(reviewSummarySource).not.toContain('text("준비 capability", "Ready capabilities")')
    expect(reviewSummarySource).not.toContain('text("저장 전 snapshot", "Pre-finish snapshot")')

    expect(reviewSummarySource).toContain('text("준비 상태", "Readiness Board")')
    expect(reviewSummarySource).toContain('text("준비 기능", "Ready capabilities")')
    expect(reviewSummarySource).toContain('text("저장 전 요약", "Pre-finish snapshot")')
  })

  it("uses a Korean task template label in topology palette", () => {
    expect(paletteSource).not.toContain('text("Task preset", "Task preset")')
    expect(paletteSource).toContain('text("작업 템플릿", "Task preset")')
  })
})
