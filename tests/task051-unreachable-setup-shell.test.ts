import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync(new URL("../packages/webui/src/pages/SetupPage.tsx", import.meta.url), "utf8")

describe("task051 unreachable setup shell", () => {
  it("does not retain the legacy setup shell behind a fake reference", () => {
    expect(source).not.toContain("renderLegacySetupStepShell")
    expect(source).not.toContain("void renderLegacySetupStepShell")
    expect(source).not.toContain('from "../components/setup/SetupStepShell"')
  })

  it("keeps the single settings workspace as the rendered settings root", () => {
    expect(source).toContain("<SingleSettingsWorkspaceShell")
    expect(source).toContain("{renderSingleSettingsBody()}")
  })
})
