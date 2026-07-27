import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("web_fetch Markdown-only lifecycle guard", () => {
  it("keeps Playwright and raw browser payloads out of the public fetch path", () => {
    const files = [
      "packages/core/src/tools/builtin/web-fetch.ts",
      "packages/core/src/adapters/public-web-document.ts",
    ]

    for (const file of files) {
      const source = readFileSync(file, "utf-8")
      expect(source, file).not.toContain("playwright")
      expect(source, file).not.toContain("page.content()")
      expect(source, file).not.toContain("screenshot")
      expect(source, file).not.toContain("raw-html")
    }
  })
})
