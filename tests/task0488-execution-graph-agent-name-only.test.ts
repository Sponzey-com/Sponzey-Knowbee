import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { ExecutorRuntimeProjection } from "../packages/core/src/orchestration/execution-graph-snapshot.ts"

describe("task0488 execution graph agentName-only runtime projection", () => {
  it("defines runtime projection with agentName and no displayName", () => {
    const projection: ExecutorRuntimeProjection = {
      agentId: "agent:research",
      agentName: "현장 조사",
      source: "config",
      status: "enabled",
      delegationEnabled: true,
      executionCandidate: true,
      role: "research",
      specialtyTags: ["research"],
      reasonCodes: [],
    }

    expect(projection.agentName).toBe("현장 조사")
    expect(projection).not.toHaveProperty("displayName")
  })

  it("keeps the ExecutorRuntimeProjection source interface free of displayName", () => {
    const source = readFileSync("packages/core/src/orchestration/execution-graph-snapshot.ts", "utf8")
    const match = source.match(/export interface ExecutorRuntimeProjection \{([\s\S]*?)\n\}/)

    expect(match?.[1]).toContain("agentName: string")
    expect(match?.[1]).not.toContain("displayName")
  })
})
