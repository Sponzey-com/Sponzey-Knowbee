import type {
  ApprovedOperationContinuationRecoverySummary,
} from "./approved-operation-continuation-recovery.js"

export interface ApprovedOperationContinuationRecoverySupervisor {
  wake(): Promise<void>
  stop(): Promise<void>
}

export function createApprovedOperationContinuationRecoverySupervisor(input: {
  recover(signal: AbortSignal): Promise<
    ApprovedOperationContinuationRecoverySummary
  >
  onSummary?(
    summary: ApprovedOperationContinuationRecoverySummary,
    signal: AbortSignal,
  ): void | Promise<void>
  onError?(): void
}): ApprovedOperationContinuationRecoverySupervisor {
  const controller = new AbortController()
  let requested = false
  let stopped = false
  let running: Promise<void> | null = null

  const startRunner = (): Promise<void> => {
    const runner = (async () => {
      while (requested && !stopped && !controller.signal.aborted) {
        requested = false
        try {
          const summary = await input.recover(controller.signal)
          await input.onSummary?.(summary, controller.signal)
        } catch {
          input.onError?.()
        }
      }
    })()
    running = runner.finally(() => {
      running = null
      if (requested && !stopped && !controller.signal.aborted) {
        void startRunner()
      }
    })
    return running
  }

  return Object.freeze({
    wake(): Promise<void> {
      if (stopped || controller.signal.aborted) return Promise.resolve()
      requested = true
      return running ?? startRunner()
    },
    async stop(): Promise<void> {
      if (stopped) {
        await running
        return
      }
      stopped = true
      requested = false
      controller.abort()
      await running
    },
  })
}
