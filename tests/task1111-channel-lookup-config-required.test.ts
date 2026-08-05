import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1111 channel lookup config boundary", () => {
  it("requires explicit config snapshots for channel connection lookup helpers", () => {
    const source = readFileSync("packages/core/src/api/routes/channels.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(functionParameterTypes(source, "listConnections")).toEqual([["KnowbeeConfig"]])
    expect(functionParameterTypes(source, "findConnection")).toEqual([[
      "string",
      "KnowbeeConfig",
    ]])
    expect(functionParameterTypes(source, "requireConnection")).toEqual([[
      "string",
      "KnowbeeConfig",
    ]])
    expect(callArgumentCounts(source, "listConnections").every((count) => count === 1)).toBe(true)
    expect(callArgumentCounts(source, "findConnection").every((count) => count === 2)).toBe(true)
    expect(callArgumentCounts(source, "requireConnection").every((count) => count === 2)).toBe(true)
  })
})
