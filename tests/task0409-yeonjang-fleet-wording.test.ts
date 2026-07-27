import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "YeonjangFleetPanel.tsx"),
  "utf-8",
)

const inspectorStart = source.indexOf("function InstanceInspector(")
const inspectorEnd = source.indexOf("function GovernanceHistory(", inspectorStart)
const inspectorSource = source.slice(inspectorStart, inspectorEnd)
const historyStart = source.indexOf("function GovernanceHistory(")
const historyEnd = source.indexOf("export function YeonjangFleetPanel(", historyStart)
const historySource = source.slice(historyStart, historyEnd)
const panelStart = source.indexOf("export function YeonjangFleetPanel(")
const panelSource = source.slice(panelStart)

describe("task0409 yeonjang fleet user-facing wording", () => {
  it("uses extension wording in the inspector instead of instance, fleet, or pairing wording", () => {
    expect(inspectorSource).not.toContain('text("선택한 인스턴스가 없습니다.", "No instance selected.")')
    expect(inspectorSource).not.toContain('text("인스턴스 이름", "Instance name")')
    expect(inspectorSource).not.toContain('text("Trust 상태", "Trust state")')
    expect(inspectorSource).not.toContain('label={text("Heartbeat", "Heartbeat")}')
    expect(inspectorSource).not.toContain('text("기능 요약", "Capability summary")')
    expect(inspectorSource).not.toContain('text("로컬 대비 차이", "Local vs remote diff")')
    expect(inspectorSource).not.toContain('text("로컬 전용 기능", "Local-only methods")')
    expect(inspectorSource).not.toContain('text("원격 전용 기능", "Remote-only methods")')
    expect(inspectorSource).not.toContain('text("신뢰와 Pairing", "Trust and pairing")')
    expect(inspectorSource).not.toContain('text("Pairing 승인", "Pairing approval")')
    expect(inspectorSource).not.toContain('placeholder={text("Pairing secret", "Pairing secret")}')
    expect(inspectorSource).not.toContain('placeholder={text("Owner user ID", "Owner user ID")}')
    expect(inspectorSource).not.toContain('placeholder={text("Workspace scope ID", "Workspace scope ID")}')
    expect(inspectorSource).not.toContain('placeholder={text("Instance alias", "Instance alias")}')
    expect(inspectorSource).not.toContain('text("현재 local marker", "Current local marker")')

    expect(inspectorSource).toContain('text("선택한 연장이 없습니다.", "No extension selected.")')
    expect(inspectorSource).toContain('text("연장 이름", "Extension name")')
    expect(inspectorSource).toContain("trustStateDisplayLabel(instance.trustState, text)")
    expect(inspectorSource).toContain("trustStateDisplayLabel(trustState, text)")
    expect(inspectorSource).toContain('text("연결 승인", "Connection approval")')
    expect(inspectorSource).toContain('text("이 컴퓨터와 선택한 컴퓨터 차이", "This computer vs selected computer")')
  })

  it("uses extension list wording in the fleet panel", () => {
    expect(panelSource).not.toContain('text("연장 Fleet", "Extension fleet")')
    expect(panelSource).not.toContain('text("전체 연장 Fleet", "Full extension fleet")')
    expect(panelSource).not.toContain('text("Fleet 상태를 불러오는 중입니다.", "Loading fleet status.")')
    expect(panelSource).not.toContain('text("명시 대상 선택 위치", "Explicit target picker placements")')
    expect(panelSource).not.toContain('text("명시 대상 후보", "Explicit target candidates")')
    expect(panelSource).not.toContain('text("기본 대상 결정", "Default target decision")')
    expect(panelSource).not.toContain('text("표시할 인스턴스가 없습니다.", "There are no instances to show.")')
    expect(panelSource).not.toContain('text("Governance 이력", "Governance history")')

    expect(panelSource).toContain('text("연장 목록", "Extension list")')
    expect(panelSource).toContain('text("전체 연장 목록", "Full extension list")')
    expect(panelSource).toContain('text("연장 목록 상태를 불러오는 중입니다.", "Loading extension list status.")')
    expect(panelSource).toContain('text("직접 선택 위치", "Direct selection locations")')
    expect(panelSource).toContain('text("직접 선택할 연장", "Extensions available for direct selection")')
    expect(panelSource).toContain('text("기본 실행 대상", "Default execution target")')
    expect(panelSource).toContain('text("표시할 연장이 없습니다.", "There are no extensions to show.")')
    expect(panelSource).toContain('text("연장 관리 이력", "Extension management history")')
  })

  it("keeps management history display user-readable", () => {
    expect(historySource).not.toContain('text("인스턴스 정보 없음", "No instance info")')
    expect(historySource).not.toContain('text("표시할 governance 이력이 없습니다.", "There is no governance history to show.")')

    expect(historySource).toContain('text("연장 정보 없음", "No extension info")')
    expect(historySource).toContain('text("표시할 연장 관리 이력이 없습니다.", "There is no extension management history to show.")')
    expect(historySource).toContain('text("처리자 기록 있음", "Actor recorded")')
    expect(historySource).toContain('text("작업 범위 연결됨", "Workspace scope linked")')
  })
})
