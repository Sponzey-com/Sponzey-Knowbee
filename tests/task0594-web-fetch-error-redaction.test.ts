import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("task0594 web fetch error redaction", () => {
  it("returns typed web_fetch failures without exposing adapter exception text", () => {
    const webFetch = source("packages/core/src/tools/builtin/web-fetch.ts")

    expect(webFetch).toContain('output: "공개 웹 문서를 가져오지 못했습니다."')
    expect(webFetch).toContain("error: outcome.reasonCode")
    expect(webFetch).toContain("reasonCode: outcome.reasonCode")
    expect(webFetch).not.toContain("error instanceof Error ? error.message : String(error)")
    expect(webFetch).not.toContain("err instanceof Error ? err.message : String(err)")
  })
})
