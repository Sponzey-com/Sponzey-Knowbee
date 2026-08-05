import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  resolveSettingsSectionId,
  settingsSectionPath,
} from "../packages/webui/src/lib/settings-route.js"

describe("Task 045 setup and settings route separation", () => {
  it("normalizes settings section deep links through one allowlist", () => {
    expect(resolveSettingsSectionId(undefined)).toBe("basics")
    expect(resolveSettingsSectionId("memory")).toBe("memory")
    expect(resolveSettingsSectionId("internal-private")).toBe("basics")
    expect(settingsSectionPath("permissions")).toBe("/settings/permissions")
  })

  it("gates initial setup and completed settings as separate routes", () => {
    const app = readFileSync("packages/webui/src/App.tsx", "utf8")
    expect(app).toMatch(/<Route\s+path="\/setup"/u)
    expect(app).toContain('<Navigate to="/settings" replace />')
    expect(app).toContain('path="/settings/:sectionId"')
    expect(app).toContain('<SetupPage mode="initial" />')
    expect(app).toContain('<SetupPage mode="settings" />')
  })

  it("keeps agents and schedules out of the settings component owner", () => {
    const setup = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")
    const app = readFileSync("packages/webui/src/App.tsx", "utf8")
    expect(setup).not.toContain("<SchedulePage")
    expect(setup).not.toContain("BeginnerSubAgentCreateDialog")
    expect(setup).not.toContain("createBeginnerSubAgent")
    expect(setup).toContain('to="/agents"')
    expect(setup).toContain('to="/work/schedules"')
    expect(app).toContain('path="/work/schedules"')
    expect(app).toContain("<SchedulePage embedded />")
  })
})
