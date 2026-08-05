import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const panelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "YeonjangFleetPanel.tsx"),
  "utf-8",
)

const fleetLibSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "lib", "yeonjang-fleet.ts"),
  "utf-8",
)

const inspectorStart = panelSource.indexOf("function InstanceInspector(")
const historyStart = panelSource.indexOf("function GovernanceHistory(")
const panelStart = panelSource.indexOf("export function YeonjangFleetPanel(")
if (inspectorStart < 0 || historyStart < 0 || panelStart < 0) {
  throw new Error("Could not extract Yeonjang fleet panel sections")
}

const inspectorSource = panelSource.slice(inspectorStart, historyStart)
const historySource = panelSource.slice(historyStart, panelStart)

describe("task0439 yeonjang fleet redaction and wording", () => {
  it("summarizes supported features without rendering raw method names", () => {
    expect(fleetLibSource).not.toContain("supportedMethods.slice")
    expect(fleetLibSource).not.toContain("supportedMethods.join")
    expect(fleetLibSource).toContain("지원 기능 정보 없음")
    expect(fleetLibSource).toContain("지원 기능 ${count}개")

    expect(inspectorSource).not.toContain("diff.supportedMethods.localOnly.join")
    expect(inspectorSource).not.toContain("diff.supportedMethods.remoteOnly.join")
    expect(inspectorSource).toContain("summarizeYeonjangCapabilityDifference")
  })

  it("does not prefill visible approval fields with stored internal scope ids", () => {
    expect(inspectorSource).not.toContain("setOwnerUserId(instance?.ownerUserId")
    expect(inspectorSource).not.toContain("setWorkspaceScopeId(instance?.workspaceScopeId")
    expect(inspectorSource).not.toContain('placeholder={text("연결 승인 비밀값", "Connection approval secret")}')
    expect(inspectorSource).toContain('placeholder={text("연결 승인 코드", "Connection approval code")}')
    expect(inspectorSource).toContain('text("사용자 범위 기록 있음", "User scope recorded")')
    expect(inspectorSource).toContain('text("작업 공간 범위 기록 있음", "Workspace scope recorded")')
  })

  it("maps management history internals to user-readable labels", () => {
    expect(historySource).not.toContain("{item.action}")
    expect(historySource).not.toContain("{item.trustState}")
    expect(historySource).not.toContain("displayText(item.reason)")
    expect(historySource).toContain("describeYeonjangGovernanceAction(item.action, text)")
    expect(historySource).toContain("trustStateDisplayLabel(item.trustState, text)")
    expect(historySource).toContain('text("사유 기록 있음", "Reason recorded")')
  })

  it("keeps unknown reason codes from falling back to raw snake_case text", () => {
    expect(fleetLibSource).not.toContain('return code.replace(/_/g, " ")')
    expect(fleetLibSource).toContain('text("추가 상태 확인 필요", "Additional state needs review")')
  })
})
