import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1081 scheduler timezone config snapshot", () => {
  it("passes scheduler health config snapshots into timezone resolution", () => {
    const source = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(functionParameterTypes(source, "getHealth")).toEqual([["KnowbeeConfig"]])
    expect(functionParameterTypes(source, "resolveScheduleTimezone")).toEqual([[
      'Pick<DbSchedule, "timezone">',
      'Pick<KnowbeeConfig, "scheduler" | "profile">',
    ]])
    expect(callArgumentCounts(source, "resolveScheduleTimezone").every((count) => count === 2)).toBe(true)
  })
})
