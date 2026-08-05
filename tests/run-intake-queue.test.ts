import { describe, expect, it, vi } from "vitest"
import {
  enqueueSessionIntake,
  hasSessionIntakeQueue,
} from "../packages/core/src/runs/intake-queue.ts"

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

describe("session intake queue", () => {
  it("serializes same-session intake tasks and clears queue state after completion", async () => {
    const sessionId = "session-intake-1"
    const deferred = createDeferred<void>()
    const order: string[] = []
    const dependencies = {
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
      appendRunEvent: vi.fn(),
    }

    const first = enqueueSessionIntake({
      sessionId,
      runId: "run-1",
      requestGroupId: "group-1",
      task: async () => {
        order.push("first-start")
        await deferred.promise
        order.push("first-end")
        return 1
      },
    }, dependencies)

    const second = enqueueSessionIntake({
      sessionId,
      runId: "run-2",
      requestGroupId: "group-2",
      task: async () => {
        order.push("second-start")
        order.push("second-end")
        return 2
      },
    }, dependencies)

    await Promise.resolve()
    await Promise.resolve()

    expect(hasSessionIntakeQueue(sessionId)).toBe(true)
    expect(order).toEqual(["first-start"])
    expect(dependencies.logInfo).toHaveBeenCalledWith(
      "session intake queued behind active intake task",
      expect.objectContaining({
        sessionId,
        runId: "run-2",
        requestGroupId: "group-2",
      }),
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-2", "intake_queue_waiting")

    deferred.resolve()

    await expect(first).resolves.toBe(1)
    await expect(second).resolves.toBe(2)
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"])
    expect(hasSessionIntakeQueue(sessionId)).toBe(false)
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-1", "intake_queue_running")
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-1", "intake_queue_released")
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-2", "intake_queue_running")
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-2", "intake_queue_released")
  })

  it("redacts intake queue failure and recovery warning details before logging", async () => {
    const sessionId = "session-intake-redaction"
    const deferred = createDeferred<void>()
    const secret = "sk-task0580-intake-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/intake-queue-secret.txt"
    const dependencies = {
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
      appendRunEvent: vi.fn(),
    }

    const first = enqueueSessionIntake({
      sessionId,
      runId: "run-intake-redaction-1",
      requestGroupId: "group-intake-redaction-1",
      task: async () => {
        await deferred.promise
        throw new Error(`token=${secret} path=${localPath}`)
      },
    }, dependencies)

    const second = enqueueSessionIntake({
      sessionId,
      runId: "run-intake-redaction-2",
      requestGroupId: "group-intake-redaction-2",
      task: async () => 2,
    }, dependencies)

    deferred.resolve()

    await expect(first).rejects.toThrow("token=")
    await expect(second).resolves.toBe(2)

    const errorPayload = JSON.stringify(dependencies.logError.mock.calls[0]?.[1] ?? {})
    const warningMessage = String(dependencies.logWarn.mock.calls[0]?.[0] ?? "")
    expect(`${errorPayload}\n${warningMessage}`).toContain("token=***")
    expect(`${errorPayload}\n${warningMessage}`).toContain("[internal-path-redacted]")
    expect(`${errorPayload}\n${warningMessage}`).not.toContain(secret)
    expect(`${errorPayload}\n${warningMessage}`).not.toContain(localPath)
  })
})
