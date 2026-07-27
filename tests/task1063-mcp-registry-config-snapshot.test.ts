import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1063 mcp registry config snapshot", () => {
  it("requires explicit config snapshots for registry loading", () => {
    const registrySource = source("packages/core/src/mcp/registry.ts")
    const indexSource = source("packages/core/src/runtime/bootstrap.ts")

    expect(legacyConfigAccesses(registrySource)).toEqual([])
    expect(functionParameterTypes(registrySource, "loadFromConfig")).toEqual([[
      "KnowbeeConfig",
      "NodeJS.ProcessEnv",
    ]])
    expect(functionParameterTypes(registrySource, "reloadFromConfig")).toEqual([[
      "KnowbeeConfig",
      "NodeJS.ProcessEnv",
    ]])
    expect(callArgumentCounts(registrySource, "loadFromConfig").every((count) => count >= 1)).toBe(true)
    expect(callArgumentCounts(indexSource, "loadFromConfig")).toEqual([2])
  })
})
