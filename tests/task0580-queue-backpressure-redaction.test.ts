import { describe, expect, it, vi } from "vitest"

const insertQueueBackpressureEvent = vi.hoisted(() => vi.fn())

vi.mock("../packages/core/src/db/index.js", () => ({
  insertQueueBackpressureEvent,
}))

describe("queue backpressure error redaction", () => {
  it("redacts failed task error detail before persistence", async () => {
    const { enqueueBackpressureTask } = await import("../packages/core/src/runs/queue-backpressure.ts")
    const secret = "sk-task0580-backpressure-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/backpressure-secret.txt"

    await expect(enqueueBackpressureTask({
      queueName: "diagnostic",
      runId: "run-backpressure-redaction",
      requestGroupId: "group-backpressure-redaction",
      task: async () => {
        throw new Error(`token=${secret} path=${localPath}`)
      },
    })).rejects.toThrow("token=")

    const failedEvent = insertQueueBackpressureEvent.mock.calls
      .map((call) => call[0])
      .find((event) => event?.eventKind === "failed")
    const payload = JSON.stringify(failedEvent ?? {})
    expect(payload).toContain("token=***")
    expect(payload).toContain("[internal-path-redacted]")
    expect(payload).not.toContain(secret)
    expect(payload).not.toContain(localPath)
  })
})
