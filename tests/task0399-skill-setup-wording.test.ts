import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "SkillSetupForm.tsx"),
  "utf-8",
)

describe("task0399 skill setup wording", () => {
  it("uses work ability wording instead of visible Skill labels", () => {
    expect(source).not.toContain('text("작업 능력 확장 (Skill)", "Skill Extensions")')
    expect(source).not.toContain('text("새 Skill 추가", "Add Skill")')
    expect(source).not.toContain('text("Skill이 없으면')
    expect(source).not.toContain('text("아직 추가된 Skill이 없습니다')
    expect(source).not.toContain('text("새 Skill", "New Skill")')
    expect(source).not.toContain('text("작업 능력 확장 (Skill)", "Skill Extension")')
    expect(source).not.toContain('text("Skill 이름 *", "Skill Name *")')

    expect(source).toContain('text("작업 능력 확장", "Work ability extensions")')
    expect(source).toContain('text("작업 능력 추가", "Add work ability")')
    expect(source).toContain('text("작업 능력 이름 *", "Work ability name *")')
    expect(source).toContain('text("이 작업 능력 사용", "Use this work ability")')
  })

  it("uses type and location wording instead of Source and Local Path labels", () => {
    expect(source).not.toContain('text("출처 (Source)", "Source")')
    expect(source).not.toContain('text("로컬 Skill", "Local Skill")')
    expect(source).not.toContain('text("기본 Skill", "Built-in Skill")')
    expect(source).not.toContain('text("로컬 Skill 경로 (Local Path) *", "Local Skill Path *")')
    expect(source).not.toContain('text("기본 Skill은 경로 입력 없이')
    expect(source).not.toContain('text("경로 확인 중...", "Checking path...")')
    expect(source).not.toContain('text("경로 확인", "Check Path")')

    expect(source).toContain('text("유형", "Type")')
    expect(source).toContain('text("로컬 항목", "Local item")')
    expect(source).toContain('text("기본 항목", "Built-in item")')
    expect(source).toContain('text("로컬 위치 *", "Local location *")')
    expect(source).toContain('text("위치 확인", "Check location")')
  })
})
