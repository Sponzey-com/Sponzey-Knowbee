import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

describe("Task054 memory overview read owner", () => {
  it("uses one sequenced resource owner for mount and refresh", () => {
    const page = source("../packages/webui/src/pages/SetupPage.tsx")
    expect(page).toContain("ResourceReadState<MemoryInspectorSnapshot>")
    expect(page).toContain("memoryOverviewReadState")
    expect(page).toContain("reduceResourceReadState")
    expect(page).toContain("projectUserRecovery")
    expect(page).toContain("memoryOverviewController")
    expect(page).toContain("memoryOverviewSequence")
    expect(page.match(/api\.memoryInspector/g)).toHaveLength(1)
    expect(page).not.toContain("memoryOverviewError")
    expect(page).not.toContain("memoryOverviewLoading")
    expect(page).not.toContain("refreshMemoryOverview")
  })

  it("forwards cancellation through the memory API boundary", () => {
    const client = source("../packages/webui/src/api/client.ts")
    const start = client.indexOf("memoryInspector: (")
    const owner = client.slice(start, client.indexOf("memoryInspectorControl:", start))
    expect(owner).toContain("signal?: AbortSignal")
    expect(owner).toContain("{ signal }")
  })

  it("keeps the overview panel projection-only and free of raw error strings", () => {
    const panel = source("../packages/webui/src/components/setup/MemorySettingsOverviewPanel.tsx")
    expect(panel).toContain("ResourceReadState<MemoryInspectorSnapshot>")
    expect(panel).toContain("ResourceReadStatusNotice")
    expect(panel).not.toContain("error: string")
    expect(panel).not.toContain("displayText(error)")
    expect(panel).not.toMatch(/\bfetch\(|api\./)
  })
})
