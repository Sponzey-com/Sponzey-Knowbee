import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyWorkspaceInspector.tsx"),
  "utf-8",
)

describe("task0413 topology workspace decision approval wording", () => {
  it("uses user-facing decision and approval labels", () => {
    expect(source).not.toContain('text("Decision 설정", "Decision settings")')
    expect(source).not.toContain('text("Condition preset", "Condition preset")')
    expect(source).not.toContain('text("Branch label preset", "Branch label preset")')
    expect(source).not.toContain('text("Approval 설정", "Approval settings")')
    expect(source).not.toContain('text("Approver position picker", "Approver position picker")')
    expect(source).not.toContain('text("Threshold preset", "Threshold preset")')

    expect(source).toContain('text("판단 설정", "Decision settings")')
    expect(source).toContain('text("판단 조건", "Decision condition")')
    expect(source).toContain('text("분기 결과", "Branch result")')
    expect(source).toContain('text("승인 설정", "Approval settings")')
    expect(source).toContain('text("승인 담당자 선택", "Approver selection")')
    expect(source).toContain('text("승인 기준", "Approval threshold")')
  })

  it("uses user-facing group and generic settings labels", () => {
    expect(source).not.toContain('text("조직 필드", "Organization fields")')
    expect(source).not.toContain('text("팀 필드", "Team fields")')
    expect(source).not.toContain('text("Group kind", "Group kind")')
    expect(source).not.toContain('text("Team", "Team")')
    expect(source).not.toContain('text("Org", "Org")')
    expect(source).not.toContain('text("Member picker", "Member picker")')
    expect(source).not.toContain('text("Responsibility tags", "Responsibility tags")')
    expect(source).not.toContain("OrgUnit")
    expect(source).not.toContain("validator")

    expect(source).toContain('text("조직 설정", "Organization settings")')
    expect(source).toContain('text("팀 설정", "Team settings")')
    expect(source).toContain('text("그룹 종류", "Group type")')
    expect(source).toContain('text("팀", "Team")')
    expect(source).toContain('text("조직", "Organization")')
    expect(source).toContain('text("구성원 선택", "Member selection")')
    expect(source).toContain('text("책임 태그", "Responsibility tags")')
    expect(source).toContain('text("고급 항목은 관계 모드와 검증 연결 후 상세 편집합니다.", "Advanced items are edited after relation mode and validation wiring.")')
  })
})
