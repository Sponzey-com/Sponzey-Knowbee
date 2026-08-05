import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1113 channel mutation current config", () => {
  it("passes the current route config snapshot into channel config mutation helpers", () => {
    const source = readFileSync("packages/core/src/api/routes/channels.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(functionParameterTypes(source, "updateRawChannelEnabled")).toEqual([[
      "RuntimeProvider",
      "boolean",
      "KnowbeeConfig",
      "RuntimePaths",
    ]])
    expect(callArgumentCounts(source, "updateRawChannelEnabled")).toEqual([4, 4])
  })
})
