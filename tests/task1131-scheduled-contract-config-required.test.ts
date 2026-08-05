import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callObjectPropertyInitializers,
  interfacePropertyTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1131 scheduled contract config required", () => {
  it("requires config as an explicit execution input without singleton fallback", () => {
    const source = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(interfacePropertyTypes(source, "ExecuteScheduleContractInput").config).toBe("KnowbeeConfig")
  })

  it("passes the scheduler snapshot as a top-level contract execution input", () => {
    const source = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(callObjectPropertyInitializers(source, "executeScheduleContract")).toEqual([
      expect.objectContaining({ config: "config" }),
    ])
  })
})
