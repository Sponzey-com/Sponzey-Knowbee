import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callObjectPropertyInitializers,
  interfacePropertyTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1075 scheduler contract executor config snapshot", () => {
  it("resolves runtime config once and passes it through scheduled execution helpers", () => {
    const source = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(interfacePropertyTypes(source, "ExecuteScheduleContractInput").config).toBe("KnowbeeConfig")
    for (const functionName of ["deliverText", "executeToolTask", "executeAgentTask", "executeArtifactDelivery"]) {
      const calls = callObjectPropertyInitializers(source, functionName)
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.every((properties) => properties.config != null)).toBe(true)
    }
  })
})
