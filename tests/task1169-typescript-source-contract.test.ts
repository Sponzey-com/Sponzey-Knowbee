import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1169 TypeScript source contracts", () => {
  it("ignores formatting and local parameter names", () => {
    const compact = "function resolve(config: KnowbeeConfig, paths: RuntimePaths) { return use(config, paths) }"
    const formatted = `
      function resolve(
        snapshot: KnowbeeConfig,
        runtimePaths: RuntimePaths,
      ) {
        return use(snapshot, runtimePaths)
      }
    `

    expect(functionParameterTypes(compact, "resolve")).toEqual([["KnowbeeConfig", "RuntimePaths"]])
    expect(functionParameterTypes(formatted, "resolve")).toEqual([["KnowbeeConfig", "RuntimePaths"]])
    expect(callArgumentCounts(compact, "use")).toEqual([2])
    expect(callArgumentCounts(formatted, "use")).toEqual([2])
  })

  it("detects legacy singleton imports and calls", () => {
    expect(legacyConfigAccesses(`
      import { getConfig, reloadConfig } from "./config/index.js"
      const first = getConfig()
      reloadConfig()
    `)).toEqual([
      "call:getConfig",
      "call:reloadConfig",
      "import:getConfig",
      "import:reloadConfig",
    ])
    expect(legacyConfigAccesses("function read(config: KnowbeeConfig) { return config }")).toEqual([])
  })
})
