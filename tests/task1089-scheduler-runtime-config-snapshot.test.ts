import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1089 scheduler runtime config snapshot", () => {
  it("threads scheduler config snapshots through health, automatic ticks, and manual runs", () => {
    const schedulerSource = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")
    const serverSource = readFileSync("packages/core/src/api/server.ts", "utf-8")
    const schedulerRouteSource = readFileSync("packages/core/src/api/routes/scheduler.ts", "utf-8")
    const schedulesRouteSource = readFileSync("packages/core/src/api/routes/schedules.ts", "utf-8")

    expect(legacyConfigAccesses(schedulerSource)).toEqual([])
    expect(functionParameterTypes(schedulerSource, "start")).toEqual([[
      "KnowbeeConfig",
      "ArtifactStorageContext",
      "MemoryJournalRepository",
      "AgentHierarchyStorage",
    ]])
    expect(functionParameterTypes(schedulerSource, "getHealth")).toEqual([["KnowbeeConfig"]])
    expect(functionParameterTypes(schedulerSource, "runNow")).toEqual([[
      "string", "string", "KnowbeeConfig", "ArtifactStorageContext", "MemoryJournalRepository", "AgentHierarchyStorage",
    ]])
    expect(functionParameterTypes(schedulerSource, "runNowInternal")).toEqual([[
      "string", "string", "KnowbeeConfig", "ArtifactStorageContext", "MemoryJournalRepository", "AgentHierarchyStorage",
    ]])
    expect(callArgumentCounts(serverSource, "startScheduler")).toEqual([4])
    expect(callArgumentCounts(schedulerRouteSource, "getHealth")).toEqual([1])
    expect(callArgumentCounts(schedulesRouteSource, "createArtifactStorageContext").every((count) => count === 1)).toBe(true)
  })
})
