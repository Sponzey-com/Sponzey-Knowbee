import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "ActiveInstructionsPanel.tsx"),
  "utf-8",
)

describe("task0394 active instructions editor wording", () => {
  it("uses user-facing labels for instruction validation details", () => {
    expect(source).not.toContain('text("프롬프트 회귀 검증", "Prompt regression")')
    expect(source).not.toContain("locale parity")
    expect(source).not.toContain("impact marker")
    expect(source).toContain('text("지침 변경 검증", "Instruction change check")')
    expect(source).toContain("책임 분리, 언어 구성, 변경 영향 확인이 모두 통과했습니다.")
    expect(source).toContain("Responsibility split, language coverage, and change-impact checks passed.")
  })

  it("uses instruction-editing language instead of raw/source editor jargon", () => {
    expect(source).not.toContain('text("프롬프트 원문 편집", "Raw prompt editing")')
    expect(source).not.toContain('text("원문은 명시적으로 편집기를 열 때만 불러옵니다.", "Raw text is loaded only after the editor is explicitly opened.")')
    expect(source).not.toContain('text("소스 편집", "Source editor")')
    expect(source).not.toContain('text("소스 불러오는 중...", "Loading source...")')
    expect(source).toContain('text("지침 편집", "Instruction editor")')
    expect(source).toContain('text("지침 원문은 명시적으로 편집기를 열 때만 불러옵니다.", "Instruction text is loaded only after the editor is explicitly opened.")')
    expect(source).toContain('text("편집할 지침 선택", "Select instruction to edit")')
    expect(source).toContain('text("지침 불러오는 중...", "Loading instruction...")')
  })
})
