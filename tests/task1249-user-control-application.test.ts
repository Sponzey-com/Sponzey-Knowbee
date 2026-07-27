import { describe, expect, it, vi } from "vitest"
import { applyUserExecutionControl, evaluateUserExecutionControl } from "../packages/core/src/index.ts"

describe("task1249 user execution control application", () => {
  it("cancels the exact current run once", async () => {
    const cancelRun = vi.fn()
    const startRedirectedRun = vi.fn()
    const decision = evaluateUserExecutionControl({ commandId: "cmd:1", command: "cancel", targetRunId: "run:1", currentRunId: "run:1", actorRef: "user:1", sequence: 2, lastAppliedSequence: 1 })
    await expect(applyUserExecutionControl({ currentRunId: "run:1", decision, cancelRun, startRedirectedRun })).resolves.toEqual({ status: "cancelled", runId: "run:1", commandId: "cmd:1" })
    expect(cancelRun).toHaveBeenCalledTimes(1)
    expect(startRedirectedRun).not.toHaveBeenCalled()
  })

  it("cancels the previous run before starting a redirected run", async () => {
    const order: string[] = []
    const decision = evaluateUserExecutionControl({ commandId: "cmd:2", command: "redirect", targetRunId: "run:1", currentRunId: "run:1", actorRef: "user:1", sequence: 3, lastAppliedSequence: 2, newGoalRef: "goal:new" })
    const result = await applyUserExecutionControl({
      currentRunId: "run:1",
      decision,
      cancelRun: () => { order.push("cancel") },
      startRedirectedRun: () => { order.push("start"); return "run:2" },
    })
    expect(order).toEqual(["cancel", "start"])
    expect(result).toMatchObject({ status: "redirected", previousRunId: "run:1", nextRunId: "run:2", newGoalRef: "goal:new" })
  })

  it("does not mutate execution for a stale or wrong-target command", async () => {
    const cancelRun = vi.fn()
    const startRedirectedRun = vi.fn()
    const decision = evaluateUserExecutionControl({ commandId: "cmd:3", command: "cancel", targetRunId: "run:other", currentRunId: "run:1", actorRef: "user:1", sequence: 2, lastAppliedSequence: 1 })
    await expect(applyUserExecutionControl({ currentRunId: "run:1", decision, cancelRun, startRedirectedRun })).resolves.toEqual({ status: "ignored", reasonCode: "wrong_target" })
    expect(cancelRun).not.toHaveBeenCalled()
    expect(startRedirectedRun).not.toHaveBeenCalled()
  })
})
