import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0593 built-in web search boundary", () => {
  it("keeps canonical web search in Knowbee Core with sanitized typed failures", () => {
    const sourcePath = "packages/core/src/tools/builtin/web-search.ts"

    expect(existsSync(sourcePath)).toBe(true)
    expect(existsSync("packages/core/src/adapters/duckduckgo-html-search.ts")).toBe(true)

    const source = readFileSync(sourcePath, "utf8")
    expect(source).toContain('name: "web_search"')
    expect(source).toContain('output: "공개 웹 검색 결과를 가져오지 못했습니다."')
    expect(source).toContain("error: outcome.reasonCode")
    expect(source).not.toContain("error instanceof Error ? error.message")
  })
})
