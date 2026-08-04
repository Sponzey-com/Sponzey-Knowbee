import { describe, expect, it, vi } from "vitest"
import {
  createApprovedOperationContinuationRecoverySupervisor,
} from "../packages/core/src/runtime/approved-operation-continuation-recovery-supervisor.ts"

const EMPTY_SUMMARY = Object.freeze({
  claimed: 0,
  completed: 0,
  blocked: 0,
  cancelled: false,
  completedRunIds: [],
})

describe("approved operation continuation recovery supervisor", () => {
  it("drains on startup wake and on a later enqueue wake", async () => {
    const recover = vi.fn(async () => EMPTY_SUMMARY)
    const supervisor =
      createApprovedOperationContinuationRecoverySupervisor({ recover })

    await supervisor.wake()
    await supervisor.wake()

    expect(recover).toHaveBeenCalledTimes(2)
    await supervisor.stop()
  })

  it("coalesces a wake during a drain without losing it and stops deterministically", async () => {
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const recover = vi.fn(async () => {
      if (recover.mock.calls.length === 1) await firstGate
      return EMPTY_SUMMARY
    })
    const supervisor =
      createApprovedOperationContinuationRecoverySupervisor({ recover })

    const first = supervisor.wake()
    const coalesced = supervisor.wake()
    releaseFirst?.()
    await Promise.all([first, coalesced])

    expect(recover).toHaveBeenCalledTimes(2)
    await supervisor.stop()
    await supervisor.wake()
    expect(recover).toHaveBeenCalledTimes(2)
  })

  it("owns and awaits same-run re-entry work with the supervisor signal", async () => {
    let releaseReentry: (() => void) | undefined
    const reentryGate = new Promise<void>((resolve) => {
      releaseReentry = resolve
    })
    const observedSignals: AbortSignal[] = []
    const supervisor =
      createApprovedOperationContinuationRecoverySupervisor({
        recover: async () => ({
          ...EMPTY_SUMMARY,
          completed: 1,
          claimed: 1,
          completedRunIds: ["run:recovered"],
        }),
        onSummary: async (_summary, signal) => {
          observedSignals.push(signal)
          await reentryGate
        },
      })

    let wakeSettled = false
    const wake = supervisor.wake().then(() => {
      wakeSettled = true
    })
    await Promise.resolve()
    expect(wakeSettled).toBe(false)
    releaseReentry?.()
    await wake
    expect(observedSignals).toHaveLength(1)

    await supervisor.stop()
    expect(observedSignals[0]?.aborted).toBe(true)
  })
})
