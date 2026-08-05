import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1121 control-plane write config snapshot", () => {
  it("persists next-start config without replacing the running snapshot", () => {
    const source = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(functionParameterTypes(source, "writeRawConfig")).toEqual([[
      "JsonObject",
      "SetupPersistencePaths",
    ]])
    expect(functionParameterTypes(source, "resetSetupEnvironment")).toEqual([[
      "SetupPersistencePaths",
    ]])
    expect(callArgumentCounts(source, "writeRawConfig").every((count) => count === 2)).toBe(true)
  })
})
