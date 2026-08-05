import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1114 settings response config boundary", () => {
  it("requires settings response helpers to receive explicit config snapshots", () => {
    const source = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(functionParameterTypes(source, "buildLegacySettingsSnapshot")).toEqual([[
      "KnowbeeConfig", "SetupPersistencePaths",
    ]])
    expect(functionParameterTypes(source, "buildSettingsResponse")).toEqual([[
      "KnowbeeConfig", "SetupPersistencePaths",
    ]])
    expect(callArgumentCounts(source, "buildSettingsResponse").every((count) => count === 2)).toBe(true)
  })
})
