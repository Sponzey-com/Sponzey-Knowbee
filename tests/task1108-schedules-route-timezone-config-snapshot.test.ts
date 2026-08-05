import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1108 schedules route timezone config snapshot", () => {
  it("passes request config snapshots into schedule timezone helpers", () => {
    const source = readFileSync("packages/core/src/api/routes/schedules.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(functionParameterTypes(source, "resolveDefaultScheduleTimezone")).toEqual([[
      'Pick<KnowbeeConfig, "scheduler" | "profile">',
    ]])
    expect(functionParameterTypes(source, "resolveBodyTimezone")).toEqual([[
      "string | undefined",
      'Pick<KnowbeeConfig, "scheduler" | "profile">',
    ]])
    expect(callArgumentCounts(source, "resolveDefaultScheduleTimezone")).toEqual([1])
    expect(callArgumentCounts(source, "resolveBodyTimezone").every((count) => count === 2)).toBe(true)
    expect(callArgumentCounts(source, "getApiRuntimeConfig").every((count) => count === 1)).toBe(true)
  })
})
