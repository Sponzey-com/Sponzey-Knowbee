import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1086 doctor config snapshot", () => {
  it("resolves doctor config once and passes it to manifest and checks", () => {
    const source = readFileSync("packages/core/src/diagnostics/doctor.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(functionParameterTypes(source, "checkWebRetrievalCapability")).toEqual([["KnowbeeConfig"]])
    expect(functionParameterTypes(source, "checkExtensionRegistry")).toEqual([[
      "KnowbeeConfig",
      "RuntimePaths",
    ]])
    expect(functionParameterTypes(source, "checkScheduleQueue")).toEqual([[
      "RuntimeManifest",
      "KnowbeeConfig",
    ]])
    expect(callArgumentCounts(source, "checkWebRetrievalCapability")).toEqual([1])
    expect(callArgumentCounts(source, "checkExtensionRegistry")).toEqual([2])
    expect(callArgumentCounts(source, "checkScheduleQueue")).toEqual([2])
  })
})
