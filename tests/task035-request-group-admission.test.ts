import { describe, expect, it, vi } from "vitest"
import {
  enqueueRequestGroupExecution,
  hasRequestGroupExecutionQueue,
} from "../packages/core/src/runs/execution-queue.ts"

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

function dependencies() {
  return {
    getRootRun: () => undefined,
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    appendRunEvent: vi.fn(),
  }
}

describe("Task 035 request-group admission", () => {
  it("rejects before execution when one running and one pending job fill the group budget", async () => {
    const gate = deferred<void>()
    const deps = dependencies()
    const executed: string[] = []
    const first = enqueueRequestGroupExecution(
      {
        requestGroupId: "group:saturated",
        runId: "run:first",
        maxPending: 1,
        task: async () => {
          executed.push("first")
          await gate.promise
          return undefined
        },
      },
      deps,
    )
    const second = enqueueRequestGroupExecution(
      {
        requestGroupId: "group:saturated",
        runId: "run:second",
        maxPending: 1,
        task: async () => {
          executed.push("second")
          return undefined
        },
      },
      deps,
    )
    const rejectedTask = vi.fn(async () => undefined)
    const third = enqueueRequestGroupExecution(
      {
        requestGroupId: "group:saturated",
        runId: "run:third",
        maxPending: 1,
        task: rejectedTask,
      },
      deps,
    )
    const thirdOutcome = third.then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    )
    expect(hasRequestGroupExecutionQueue("group:saturated")).toBe(true)

    gate.resolve()
    await first
    await second
    const settledThird = await thirdOutcome
    expect(settledThird).toMatchObject({
      status: "rejected",
      error: { code: "queue_full", queueName: "interactive_run" },
    })
    expect(executed).toEqual(["first", "second"])
    expect(rejectedTask).not.toHaveBeenCalled()
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run:third",
      "execution_queue_rejected:queue_full",
    )
    expect(hasRequestGroupExecutionQueue("group:saturated")).toBe(false)
  })

  it("keeps another request group runnable while one group is saturated", async () => {
    const gate = deferred<void>()
    const deps = dependencies()
    const first = enqueueRequestGroupExecution(
      {
        requestGroupId: "group:blocked",
        runId: "run:blocked",
        maxPending: 0,
        task: async () => {
          await gate.promise
          return undefined
        },
      },
      deps,
    )
    const otherTask = vi.fn(async () => undefined)

    const rejected = enqueueRequestGroupExecution(
      {
        requestGroupId: "group:blocked",
        runId: "run:rejected",
        maxPending: 0,
        task: async () => undefined,
      },
      deps,
    ).then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    )
    await expect(
      enqueueRequestGroupExecution(
        {
          requestGroupId: "group:other",
          runId: "run:other",
          maxPending: 0,
          task: otherTask,
        },
        deps,
      ),
    ).resolves.toBeUndefined()
    expect(otherTask).toHaveBeenCalledOnce()

    gate.resolve()
    await first
    await expect(rejected).resolves.toMatchObject({
      status: "rejected",
      error: { code: "queue_full", queueName: "interactive_run" },
    })
  })

  it("routes saturation through the supplied terminal handler without running the task", async () => {
    const gate = deferred<void>()
    const deps = dependencies()
    const first = enqueueRequestGroupExecution(
      {
        requestGroupId: "group:terminal",
        runId: "run:active",
        maxPending: 0,
        task: async () => {
          await gate.promise
          return undefined
        },
      },
      deps,
    )
    const rejectedTask = vi.fn(async () => undefined)
    const onAdmissionRejected = vi.fn(async () => undefined)

    await expect(
      enqueueRequestGroupExecution(
        {
          requestGroupId: "group:terminal",
          runId: "run:terminal-rejected",
          maxPending: 0,
          task: rejectedTask,
        },
        { ...deps, onAdmissionRejected },
      ),
    ).resolves.toBeUndefined()
    expect(rejectedTask).not.toHaveBeenCalled()
    expect(onAdmissionRejected).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: "queue_full", queueName: "interactive_run" }),
      runId: "run:terminal-rejected",
      requestGroupId: "group:terminal",
      pendingCount: 0,
    })

    gate.resolve()
    await first
  })
})
