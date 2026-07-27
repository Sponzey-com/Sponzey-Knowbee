import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callObjectPropertyInitializers,
  interfacePropertyTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1077 scheduled execution config snapshot", () => {
  it("passes explicit runtime config and hierarchy snapshots into canonical scheduled execution", () => {
    const agentSource = readFileSync("packages/core/src/agent/index.ts", "utf-8")
    const schedulerSource = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")
    const contractExecutorSource = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")

    expect(legacyConfigAccesses(agentSource)).toEqual([])
    expect(legacyConfigAccesses(schedulerSource)).toEqual([])
    expect(legacyConfigAccesses(contractExecutorSource)).toEqual([])
    expect(interfacePropertyTypes(contractExecutorSource, "ExecuteScheduleContractInput").config).toBe("KnowbeeConfig")
    expect(interfacePropertyTypes(contractExecutorSource, "ExecuteScheduleContractInput").hierarchyStorage).toBe("AgentHierarchyStorage")
    expect(callObjectPropertyInitializers(schedulerSource, "executeScheduleContract")).toEqual([
      expect.objectContaining({ config: "config" }),
    ])
    expect(contractExecutorSource).not.toContain('import { runAgent } from "../agent/index.js"')
    expect(contractExecutorSource).toContain("config: params.config")
    expect(contractExecutorSource).toContain("hierarchyStorage: params.hierarchyStorage")
  })
})
