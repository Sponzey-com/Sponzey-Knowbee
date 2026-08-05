import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task043 SetupPage single workspace root", () => {
  it("composes the single workspace without a UI mode render branch", () => {
    const source = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")

    expect(source).toContain("SingleSettingsWorkspaceShell")
    expect(source).toContain("buildSingleSettingsWorkspaceForSetup")
    expect(source).toContain("resolveSetupSectionBodyOwner")
    expect(source).not.toContain('if (uiMode === "beginner") {\n    return')
    expect(source).not.toContain("return renderBeginnerSetup()")
  })

  it("does not mount legacy settings or link back to an advanced settings route", () => {
    const source = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")
    expect(source).not.toContain("SettingsPage")
    expect(source).not.toContain('to="/advanced/')
  })

  it("routes sub-agent management to its dedicated owner", () => {
    const page = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")
    expect(page).toContain('to="/agents"')
    expect(page).not.toContain("BeginnerSubAgentCreateDialog")
    expect(page).not.toContain("createBeginnerSubAgent")
  })
})
