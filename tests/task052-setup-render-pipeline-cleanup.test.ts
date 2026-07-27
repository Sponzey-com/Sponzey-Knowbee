import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync(new URL("../packages/webui/src/pages/SetupPage.tsx", import.meta.url), "utf8")

describe("task052 setup render pipeline cleanup", () => {
  it("does not retain unreachable step or visualization renderers", () => {
    expect(source).not.toContain("function renderBody()")
    expect(source).not.toContain("function renderVisualizationInspector()")
    expect(source).not.toContain("visualizationMobileInspector")
  })

  it("does not branch the unified setup page by beginner or advanced UI mode", () => {
    expect(source).not.toContain("const uiMode =")
    expect(source).not.toContain("previousUiModeRef")
    expect(source).not.toContain("usesVisualizationShell")
  })
})
