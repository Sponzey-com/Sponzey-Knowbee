import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { legacyConfigAccesses } from "./fixtures/typescript-source-contract.ts"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1060 built-in web search config snapshot", () => {
  it("keeps canonical web search available while passing runtime config explicitly", () => {
    const dispatcherSource = source("packages/core/src/tools/dispatcher.ts")

    expect(DEFAULT_CONFIG.search).toEqual({})
    expect(existsSync("packages/core/src/tools/builtin/web-search.ts")).toBe(true)
    expect(existsSync("packages/core/src/adapters/duckduckgo-html-search.ts")).toBe(true)
    expect(legacyConfigAccesses(dispatcherSource)).toEqual([])
    expect(dispatcherSource).toMatch(
      /function buildRuntimeToolContext\(input:\s*\{[\s\S]*config:\s*ToolRuntimeConfigSnapshot/u,
    )
    expect(dispatcherSource).toContain("const searchConfig = ctx.searchConfig ?? config.search")
  })
})
