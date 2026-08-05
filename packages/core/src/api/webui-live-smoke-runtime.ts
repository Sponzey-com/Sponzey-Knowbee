import {
  DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS,
  observeLiveSmokeTerminal,
} from "../channels/live-smoke-terminal-observer.js"
import type { WebUiLiveSmokeExecutorPorts } from "../channels/webui-live-smoke-executor.js"
import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js"
import type { StartedIngressRun } from "../runs/ingress.js"
import type { RequestExecutionOutcome } from "../runs/flow-contract.js"
import type { RootRun } from "../runs/types.js"
import type { WebUiLiveSmokeEvidenceProjection } from "./webui-live-smoke-evidence.js"
import type { LiveSmokeDecisionReceiptReader } from "../channels/live-smoke-decision-receipts.js"
import type { LiveSmokeFirstResponseLatencyReader } from "../channels/live-smoke-latency-evidence.js"

export interface WebUiLiveSmokeRuntimeDependencies {
  startCanonicalRequest(request: string): StartedIngressRun
  observabilityRepository: Pick<TypedObservabilityEventRepository, "list">
  listTopologyRunsForRootRun(rootRunId: string): readonly unknown[]
  readExecutionOutcome(runId: string): RequestExecutionOutcome | undefined
  readDecisionReceiptRefs: LiveSmokeDecisionReceiptReader
  readFirstResponseLatency: LiveSmokeFirstResponseLatencyReader
  readEvidence(run: { id: string; requestGroupId: string }): WebUiLiveSmokeEvidenceProjection
  cancelRun?(runId: string): void
  timeoutMs?: number
  now?: () => number
}

export function createWebUiLiveSmokeRuntimePorts(
  dependencies: WebUiLiveSmokeRuntimeDependencies,
): WebUiLiveSmokeExecutorPorts {
  const completions = new Map<
    string,
    { finished: Promise<RootRun | undefined>; startedAt: number }
  >()
  const timeoutMs = Math.max(
    1,
    Math.floor(
      dependencies.timeoutMs ?? DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS,
    ),
  )
  const now = dependencies.now ?? Date.now

  return {
    startRequest(input) {
      const startedAt = now()
      const ingress = dependencies.startCanonicalRequest(input.request)
      const started = {
        requestId: ingress.requestId,
        runId: ingress.started.runId,
        requestGroupId: ingress.started.runId,
      }
      completions.set(started.runId, {
        finished: ingress.started.finished,
        startedAt,
      })
      return started
    },
    async observeTerminal(input) {
      const completion = completions.get(input.started.runId)
      try {
        const observed = await observeLiveSmokeTerminal({
          started: input.started,
          completion: completion?.finished,
          observabilityRepository: dependencies.observabilityRepository,
          listTopologyRunsForRootRun: dependencies.listTopologyRunsForRootRun,
          readExecutionOutcome: dependencies.readExecutionOutcome,
          readDecisionReceiptRefs: dependencies.readDecisionReceiptRefs,
          readFirstResponseLatency: dependencies.readFirstResponseLatency,
          ...(completion ? { startedAt: completion.startedAt } : {}),
          now,
          timeoutMs,
          ...(input.signal ? { signal: input.signal } : {}),
          completionRejection: "interrupted",
        })
        if (observed.projection.terminalStatus === "timed_out") {
          dependencies.cancelRun?.(input.started.runId)
        }
        if (!observed.run) return observed.projection
        return {
          ...observed.projection,
          ...dependencies.readEvidence(observed.run),
        }
      } finally {
        completions.delete(input.started.runId)
      }
    },
  }
}
