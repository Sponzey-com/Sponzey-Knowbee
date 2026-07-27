import { createHash } from "node:crypto"
import {
  DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS,
  observeLiveSmokeTerminal,
} from "../channels/live-smoke-terminal-observer.js"
import type { TelegramLiveSmokeExecutorPorts } from "../channels/telegram-live-smoke-executor.js"
import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js"
import type { RequestExecutionOutcome } from "../runs/flow-contract.js"
import type { RootRun } from "../runs/types.js"
import type { TelegramLiveSmokeTarget } from "./server-runtime-context.js"
import type { TelegramLiveSmokeEvidenceProjection } from "./telegram-live-smoke-evidence.js"
import type { LiveSmokeDecisionReceiptReader } from "../channels/live-smoke-decision-receipts.js"
import type { LiveSmokeFirstResponseLatencyReader } from "../channels/live-smoke-latency-evidence.js"

export interface StartedTelegramLiveSmokeIngress {
  requestId: string
  runId: string
  requestGroupId: string
  finished: Promise<RootRun | undefined>
}

export interface TelegramLiveSmokeRuntimeDependencies {
  target: TelegramLiveSmokeTarget
  startCanonicalRequest(input: {
    request: string
    target: TelegramLiveSmokeTarget
  }): Promise<StartedTelegramLiveSmokeIngress>
  observabilityRepository: Pick<TypedObservabilityEventRepository, "list">
  listTopologyRunsForRootRun(rootRunId: string): readonly unknown[]
  readExecutionOutcome(runId: string): RequestExecutionOutcome | undefined
  readDecisionReceiptRefs: LiveSmokeDecisionReceiptReader
  readFirstResponseLatency: LiveSmokeFirstResponseLatencyReader
  readEvidence(
    run: { id: string; requestGroupId: string },
    target: TelegramLiveSmokeTarget,
  ): TelegramLiveSmokeEvidenceProjection
  cancelRun?(runId: string): void
  timeoutMs?: number
  now?: () => number
}

function targetFingerprint(target: TelegramLiveSmokeTarget): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([target.chatId, target.userId, target.threadId ?? null]))
    .digest("hex")
    .slice(0, 24)
  return `telegram-target:${digest}`
}

export function createTelegramLiveSmokeRuntimePorts(
  dependencies: TelegramLiveSmokeRuntimeDependencies,
): TelegramLiveSmokeExecutorPorts {
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
  const fingerprint = targetFingerprint(dependencies.target)
  const now = dependencies.now ?? Date.now

  return {
    async startRequest(input) {
      const startedAt = now()
      const ingress = await dependencies.startCanonicalRequest({
        request: input.request,
        target: dependencies.target,
      })
      completions.set(ingress.runId, {
        finished: ingress.finished,
        startedAt,
      })
      return {
        requestId: ingress.requestId,
        runId: ingress.runId,
        requestGroupId: ingress.requestGroupId,
        targetFingerprint: fingerprint,
      }
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
          completionRejection: "throw",
        })
        if (observed.projection.terminalStatus === "timed_out") {
          dependencies.cancelRun?.(input.started.runId)
        }
        if (!observed.run) return unavailableObservation(observed.projection, fingerprint)
        return {
          ...observed.projection,
          targetFingerprint: fingerprint,
          ...dependencies.readEvidence(observed.run, dependencies.target),
        }
      } finally {
        completions.delete(input.started.runId)
      }
    },
  }
}

function unavailableObservation(
  projection: Awaited<ReturnType<typeof observeLiveSmokeTerminal>>["projection"],
  fingerprint: string,
) {
  return {
    ...projection,
    targetFingerprint: fingerprint,
    providerDeliveryReceipted: false,
    targetMatched: false,
    userReportDelivered: false,
    userReportDeliveryCount: 0,
  }
}
