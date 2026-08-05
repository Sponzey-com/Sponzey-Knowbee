import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1000 page main-agent fallback cleanup", () => {
  it("keeps page-level main-agent fallback names delegated to the WebUI copy helper", () => {
    const setupPage = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf-8")
    const topologyPage = readFileSync("packages/webui/src/pages/TopologyWorkspacePage.tsx", "utf-8")

    expect(setupPage).toContain("defaultMainAgentNameForLanguage")
    expect(setupPage).not.toContain('pickUiText(uiLanguage, "노비", "Knowbee")')

    expect(topologyPage).toContain("mainAgentNameForDraft")
    expect(topologyPage).not.toContain('text("노비", "Knowbee")')
  })
})
