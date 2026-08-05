import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"),
  "utf-8",
)

describe("task0454 dashboard doctor mode redaction", () => {
  it("maps doctor report mode before rendering the run label", () => {
    expect(source).not.toContain("`${report.mode} · ${new Date(report.createdAt).toLocaleString()}`")
    expect(source).toContain("function doctorModeLabel(mode: DoctorMode")
    expect(source).toContain('case "quick"')
    expect(source).toContain('return text("빠른 진단", "Quick check")')
    expect(source).toContain('case "full"')
    expect(source).toContain('return text("전체 진단", "Full check")')
    expect(source).toContain("doctorReportRunLabel(report, text)")
  })

  it("keeps doctor run time visible without exposing internal mode text", () => {
    expect(source).toContain("function doctorReportRunLabel(report: DoctorReport")
    expect(source).toContain("doctorModeLabel(report.mode, text)")
    expect(source).toContain("new Date(report.createdAt).toLocaleString()")
  })
})
