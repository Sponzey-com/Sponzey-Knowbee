import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callObjectPropertyInitializers,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1076 schedule action config snapshot", () => {
  it("passes runtime config snapshots into default schedule action dependencies", () => {
    const actionSource = readFileSync("packages/core/src/runs/action-execution.ts", "utf-8")
    const intakeSource = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")
    const startBridgeSource = readFileSync("packages/core/src/runs/start-bridges.ts", "utf-8")

    expect(legacyConfigAccesses(actionSource)).toEqual([])
    expect(legacyConfigAccesses(intakeSource)).toEqual([])
    expect(legacyConfigAccesses(startBridgeSource)).toEqual([])
    expect(callObjectPropertyInitializers(intakeSource, "createDefaultScheduleActionDependencies")).toEqual([
      expect.objectContaining({ config: "params.config" }),
    ])
  })
})
