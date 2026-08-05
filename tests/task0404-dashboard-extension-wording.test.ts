import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const dashboardSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"), "utf-8")

describe("task0404 dashboard extension wording", () => {
  it("uses work ability and external feature wording in setup step labels", () => {
    expect(dashboardSource).not.toContain('mcp: { ko: "외부 기능 연결", en: "External tools" }')
    expect(dashboardSource).not.toContain('skills: { ko: "작업 능력 확장", en: "Skills" }')

    expect(dashboardSource).toContain('mcp: { ko: "외부 기능 연결", en: "External feature connections" }')
    expect(dashboardSource).toContain('skills: { ko: "작업 능력 확장", en: "Work ability extensions" }')
  })

  it("uses external tool wording for the status count", () => {
    expect(dashboardSource).not.toContain('text("사용 가능 기능", "Available tools")')
    expect(dashboardSource).toContain('text("사용 가능한 외부 도구", "Available external tools")')
  })
})
