import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"),
  "utf-8",
)

describe("task0390 dashboard diagnostics wording", () => {
  it("does not render internal capability keys in the dashboard summary", () => {
    expect(source).not.toContain('<div className="mt-1 text-xs text-stone-500">{item.key}</div>')
    expect(source).toContain('text("상태 신호 연결됨", "Status signal linked")')
  })

  it("maps doctor status and summary values before rendering them", () => {
    expect(source).not.toContain('value={report.overallStatus}')
    expect(source).not.toContain('<StatusRow label="Manifest" value={report.runtimeManifestId} mono />')
    expect(source).not.toContain('<StatusRow label="Checks"')
    expect(source).not.toContain("ok=${report.summary.ok}")
    expect(source).not.toContain("{check.name} · {check.status}")
    expect(source).toContain("function doctorStatusLabel(status: DoctorStatus")
    expect(source).toContain("doctorStatusLabel(report.overallStatus, text)")
    expect(source).toContain("doctorStatusLabel(check.status, text)")
    expect(source).toContain('text("진단 기준", "Diagnostic baseline")')
    expect(source).toContain('text("검사 결과", "Check results")')
  })
})
