import { describe, expect, it } from "vitest"
import { shouldDispatchPreAnalyzedRootDelegation } from "../packages/core/src/runs/start.ts"

describe("task037 topology canonical lifecycle continuity", () => {
  it.each([
    {
      label: "topology routing is off while a child executor is available",
      orchestrationMode: "orchestration" as const,
      delegatedTaskCount: 1,
    },
    {
      label: "no active child executor is available",
      orchestrationMode: "single_knowbee" as const,
      delegatedTaskCount: 0,
    },
  ])("keeps canonical intake first when $label", ({ orchestrationMode, delegatedTaskCount }) => {
    expect(shouldDispatchPreAnalyzedRootDelegation({
      isRootRequest: true,
      hasParentRun: false,
      runScope: "root",
      skipIntake: false,
      orchestrationMode,
      delegatedTaskCount,
    })).toBe(false)
  })

  it("allows executor dispatch only for an explicitly pre-analyzed root request", () => {
    expect(shouldDispatchPreAnalyzedRootDelegation({
      isRootRequest: true,
      hasParentRun: false,
      runScope: "root",
      skipIntake: true,
      orchestrationMode: "orchestration",
      delegatedTaskCount: 1,
    })).toBe(true)
  })
})
