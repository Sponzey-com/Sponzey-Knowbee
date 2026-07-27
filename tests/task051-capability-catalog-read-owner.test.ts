import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

function between(value: string, start: string, end: string): string {
  return value.slice(value.indexOf(start), value.indexOf(end, value.indexOf(start)))
}

describe("Task051 capability catalog primary read owners", () => {
  it("migrates MCP list reads without clearing verified items", () => {
    const page = source("../packages/webui/src/pages/McpCatalogPage.tsx")
    const owner = between(page, "const load = useCallback", "useEffect(() =>")
    expect(page).toContain("ResourceReadState<McpCatalogPageResponse>")
    expect(page).toContain("ResourceReadStatusNotice")
    expect(owner).toContain("reduceResourceReadState")
    expect(owner).toContain("projectUserRecovery")
    expect(owner).not.toContain("setItems([])")
    expect(owner).not.toContain("cause instanceof Error ? cause.message")
  })

  it("migrates Yeonjang list and summary without generic retry", () => {
    const page = source("../packages/webui/src/pages/YeonjangCatalogPage.tsx")
    const owner = between(page, "const load = useCallback", "useEffect(() =>")
    const primaryCatalog = between(page, "export function YeonjangCatalogView", "<Drawer")
    expect(page).toContain("ResourceReadState<YeonjangCapabilityPage>")
    expect(page).toContain("ResourceReadStatusNotice")
    expect(owner).toContain("reduceResourceReadState")
    expect(owner).toContain("projectUserRecovery")
    expect(owner).not.toContain("setItems([])")
    expect(owner).not.toContain("setSummary(EMPTY_SUMMARY)")
    expect(owner).not.toContain("cause instanceof Error ? cause.message")
    expect(primaryCatalog).not.toContain('text("다시 시도", "Retry")')
  })

  it("keeps initial failure mutually exclusive with catalog empty state", () => {
    for (const file of ["McpCatalogPage.tsx", "YeonjangCatalogPage.tsx"]) {
      const page = source(`../packages/webui/src/pages/${file}`)
      expect(page).toContain('readState.status === "failed"')
      expect(page).toContain('readState.status === "stale"')
      expect(page).toContain('readState.status !== "failed"')
    }
  })
})
