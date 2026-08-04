import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const skillsStepSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "lib", "setup-step-meta.ts"), "utf-8")
const inspectorSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "setup", "SkillSetupForm.tsx"), "utf-8")

describe("task0400 setup skill step wording", () => {
  it("uses work ability wording in the setup step summary", () => {
    expect(skillsStepSource).not.toContain("등록된 Skill")
    expect(skillsStepSource).not.toContain("필수 Skill")
    expect(skillsStepSource).not.toContain("Skill 설정을 다시 확인해 주세요.")
    expect(skillsStepSource).not.toContain("기본 Skill")
    expect(skillsStepSource).not.toContain("로컬 Skill")
    expect(skillsStepSource).not.toContain("고급 Skill 안내")

    expect(skillsStepSource).toContain("등록한 작업 능력의 상태를 다시 확인해야 합니다.")
    expect(skillsStepSource).toContain("로컬 또는 기본 작업 능력을 등록합니다.")
    expect(skillsStepSource).toContain("필요한 작업 능력만 켜고 설명을 정리합니다.")
    expect(skillsStepSource).toContain("로컬 작업 능력은 경로 확인을 통해 준비 상태를 확인합니다.")
  })

  it("uses work ability wording in the right-side setup inspector", () => {
    expect(inspectorSource).not.toContain('pickUiText(language, "Skill", "Skill")')
    expect(inspectorSource).not.toContain("선택한 Skill의 출처")
    expect(inspectorSource).not.toContain("아직 Skill이 없습니다")
    expect(inspectorSource).not.toContain("새 Skill 추가")
    expect(inspectorSource).not.toContain("Select a skill from the readiness map or add a new skill.")

    expect(inspectorSource).toContain('text("작업 능력 확장", "Work ability extensions")')
    expect(inspectorSource).toContain("아직 추가된 작업 능력이 없습니다")
    expect(inspectorSource).toContain("작업 능력 추가")
    expect(inspectorSource).toContain("필수 작업 능력으로 표시")
    expect(inspectorSource).toContain("로컬 위치 *")
  })
})
