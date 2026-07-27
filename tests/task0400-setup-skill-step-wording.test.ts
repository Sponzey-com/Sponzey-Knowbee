import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const setupSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "SetupPage.tsx"), "utf-8")

const skillsStepStart = setupSource.indexOf('case "skills":')
const skillsStepEnd = setupSource.indexOf('case "security":', skillsStepStart)
const skillsStepSource = setupSource.slice(skillsStepStart, skillsStepEnd)

const inspectorStart = setupSource.indexOf("function SkillsSetupInspector(")
const inspectorEnd = setupSource.indexOf("function SecuritySetupInspector(", inspectorStart)
const inspectorSource = setupSource.slice(inspectorStart, inspectorEnd)

describe("task0400 setup skill step wording", () => {
  it("uses work ability wording in the setup step summary", () => {
    expect(skillsStepSource).not.toContain("등록된 Skill")
    expect(skillsStepSource).not.toContain("필수 Skill")
    expect(skillsStepSource).not.toContain("Skill 설정을 다시 확인해 주세요.")
    expect(skillsStepSource).not.toContain("기본 Skill")
    expect(skillsStepSource).not.toContain("로컬 Skill")
    expect(skillsStepSource).not.toContain("고급 Skill 안내")

    expect(skillsStepSource).toContain("등록된 작업 능력")
    expect(skillsStepSource).toContain("필수 작업 능력")
    expect(skillsStepSource).toContain("작업 능력 설정을 다시 확인해 주세요.")
    expect(skillsStepSource).toContain("고급 작업 능력 안내")
    expect(skillsStepSource).toContain("로컬 위치")
  })

  it("uses work ability wording in the right-side setup inspector", () => {
    expect(inspectorSource).not.toContain('pickUiText(language, "Skill", "Skill")')
    expect(inspectorSource).not.toContain("선택한 Skill의 출처")
    expect(inspectorSource).not.toContain("아직 Skill이 없습니다")
    expect(inspectorSource).not.toContain("새 Skill 추가")
    expect(inspectorSource).not.toContain("Select a skill from the readiness map or add a new skill.")

    expect(inspectorSource).toContain('pickUiText(language, "작업 능력", "Work ability")')
    expect(inspectorSource).toContain("선택한 작업 능력의 유형")
    expect(inspectorSource).toContain("아직 작업 능력이 없습니다")
    expect(inspectorSource).toContain("작업 능력 추가")
    expect(inspectorSource).toContain("Select a work ability from the readiness map or add a new work ability.")
  })
})
