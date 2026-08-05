import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

function between(value: string, start: string, end: string): string {
  const begin = value.indexOf(start)
  return value.slice(begin, value.indexOf(end, begin))
}

describe("Task053 capability detail read owners", () => {
  it("replaces the MCP raw detail string with a selected-resource owner", () => {
    const page = source("../packages/webui/src/pages/McpCatalogPage.tsx")
    const detailOwner = between(page, "const loadDetail", "const transitionMutation")
    expect(page).toContain("ResourceReadState<McpCatalogDetail>")
    expect(page).toContain("detailReadState")
    expect(page).toContain("onRefreshDetail")
    expect(page).not.toContain("detailError?: string | null")
    expect(page).not.toContain("setDetailError")
    expect(detailOwner).toContain("reduceResourceReadState")
    expect(detailOwner).toContain("projectUserRecovery")
    expect(detailOwner).toContain("detailSequence")
  })

  it("replaces the Yeonjang silent catch with abortable sequenced detail state", () => {
    const page = source("../packages/webui/src/pages/YeonjangCatalogPage.tsx")
    const detailOwner = between(page, "const loadDetail", "const confirmRecovery")
    expect(page).toContain("ResourceReadState<YeonjangCapabilityDetail>")
    expect(page).toContain("detailReadState")
    expect(page).toContain("onRefreshDetail")
    expect(page).toContain("detailControllerRef")
    expect(page).toContain("detailSequenceRef")
    expect(detailOwner).toContain("reduceResourceReadState")
    expect(detailOwner).toContain("projectUserRecovery")
    expect(detailOwner).not.toContain("Keep the safe list projection visible")
  })

  it("renders only shared safe recovery and never a detail failure reason", () => {
    for (const file of ["McpCatalogPage.tsx", "YeonjangCatalogPage.tsx"]) {
      const page = source(`../packages/webui/src/pages/${file}`)
      expect(page).toContain("ResourceReadStatusNotice")
      expect(page).toContain('subject="capabilities"')
      expect(page).not.toContain("mcp_detail_read_failed")
      expect(page).not.toContain("yeonjang_detail_read_failed")
    }
  })

  it("invalidates detail responses after the drawer closes", () => {
    const mcp = between(
      source("../packages/webui/src/pages/McpCatalogPage.tsx"),
      "onCloseDetail={() =>",
      "onRefreshDetail",
    )
    const yeonjang = between(
      source("../packages/webui/src/pages/YeonjangCatalogPage.tsx"),
      "onCloseDetail={() =>",
      "onRefreshDetail",
    )
    expect(mcp).toContain("detailController.current?.abort()")
    expect(mcp).toContain("detailSequence.current += 1")
    expect(yeonjang).toContain("detailControllerRef.current?.abort()")
    expect(yeonjang).toContain("detailSequenceRef.current += 1")
  })
})
