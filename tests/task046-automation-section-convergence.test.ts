import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { resolveSetupSectionBodyOwner } from "../packages/webui/src/lib/setup-section-body-mapping.ts"

describe("task046 automation section convergence", () => {
  it("maps automation to the embedded schedules body", () => {
    expect(resolveSetupSectionBodyOwner("automation")).toEqual({
      sectionId: "automation",
      source: "simple_body",
      simpleBodyId: "schedules",
      lifecycle: "active",
    })
  })

  it("links to the dedicated schedule manager without mounting it in settings", () => {
    const setup = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")
    const schedules = readFileSync("packages/webui/src/pages/SchedulePage.tsx", "utf8")
    expect(setup).not.toContain("<SchedulePage")
    expect(setup).toContain('owner.simpleBodyId === "schedules"')
    expect(setup).toContain('to="/work/schedules"')
    expect(schedules).toContain("embedded = false")
    expect(schedules).not.toContain("{selectedSchedule.id}")
    expect(schedules).not.toContain("selectedLegacyReport.persistence.identityKey")
    expect(schedules).not.toContain("selectedLegacyReport.persistence.payloadHash")
  })

  it("redirects legacy advanced schedule routes to the single owner", () => {
    const app = readFileSync("packages/webui/src/App.tsx", "utf8")
    expect(app).toContain('import("./pages/SchedulePage")')
    expect(app).toContain("<SchedulePage embedded />")
    expect(app).toContain('path="/work/schedules"')
    expect(app).toContain('path="/advanced/schedules"')
    expect(app).toContain('<Navigate to="/work/schedules" replace />')
  })
})
