import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("web search env snapshot", () => {
  it("uses immutable code defaults without browser preference environment reads", () => {
    const configSource = readFileSync(
      new URL("../packages/core/src/config/index.ts", import.meta.url),
      "utf-8",
    )
    const adapterSource = readFileSync(
      new URL("../packages/core/src/adapters/duckduckgo-html-search.ts", import.meta.url),
      "utf-8",
    )

    expect(existsSync(new URL("../packages/core/src/tools/builtin/web-search.ts", import.meta.url))).toBe(true)
    expect(existsSync(new URL("../packages/core/src/tools/builtin/search-providers", import.meta.url))).toBe(false)
    expect(configSource).not.toContain("KNOWBEE_SELENIUM_BROWSER")
    expect(configSource).not.toContain("browserPreference: webSearchBrowserPreference")
    expect(adapterSource).toContain("DEFAULT_DUCKDUCKGO_PROVIDER")
    expect(adapterSource).not.toContain("process.env")
  })
})
