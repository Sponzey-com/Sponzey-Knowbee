import { projectTypedObservabilityTrace } from "../observability/typed-event-contract.js"
import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js"
import type { RequestExecutionOutcome } from "../runs/flow-contract.js"
import type { RootRun, RunStatus } from "../runs/types.js"
import type {
  LiveSmokeDecisionReceiptReader,
  LiveSmokeDecisionReceiptRefs,
} from "./live-smoke-decision-receipts.js"
import type {
  LiveSmokeFirstResponseLatencyEvidence,
  LiveSmokeFirstResponseLatencyReader,
} from "./live-smoke-latency-evidence.js"

export const DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS = 240_000

export interface LiveSmokeLatencyEvidence
  extends LiveSmokeFirstResponseLatencyEvidence {
  terminalResponseLatencyMs: number
  completedAt: number
}

export interface LiveSmokeStartedIdentity {
  requestId: string
  runId: string
  requestGroupId: string
}

export interface LiveSmokeTerminalProjection extends LiveSmokeStartedIdentity, LiveSmokeDecisionReceiptRefs {
  terminalStatus: "completed" | "failed" | "cancelled" | "interrupted" | "timed_out"
  typedTraceStatus: "ready" | "not_recorded" | "unavailable"
  typedTraceTerminal: boolean
  typedTraceIssueCount: number
  analysisCompleted: boolean
  evidenceRecorded: boolean
  reviewCompleted: boolean
  finalizationCompleted: boolean
  rootOwnerFinalized: boolean
  finalAnswerCount: number
  topologyRunCount: number
  auditEventId?: string
  resultReviewReasonCodes: readonly string[]
  executionOutcome?: RequestExecutionOutcome
  latencyEvidence?: LiveSmokeLatencyEvidence
}

export interface ObserveLiveSmokeTerminalInput {
  started: LiveSmokeStartedIdentity
  completion: Promise<RootRun | undefined> | undefined
  observabilityRepository: Pick<TypedObservabilityEventRepository, "list">
  listTopologyRunsForRootRun(rootRunId: string): readonly unknown[]
  readExecutionOutcome?(runId: string): RequestExecutionOutcome | undefined
  readDecisionReceiptRefs?: LiveSmokeDecisionReceiptReader
  readFirstResponseLatency?: LiveSmokeFirstResponseLatencyReader
  startedAt?: number
  now?: () => number
  timeoutMs: number
  signal?: AbortSignal
  completionRejection: "interrupted" | "throw"
}

export interface ObserveLiveSmokeTerminalResult {
  projection: LiveSmokeTerminalProjection
  run?: RootRun
}

export async function observeLiveSmokeTerminal(
  input: ObserveLiveSmokeTerminalInput,
): Promise<ObserveLiveSmokeTerminalResult> {
  if (!input.completion) {
    return { projection: unavailableLiveSmokeTerminal(input.started, "interrupted") }
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let abortHandler: (() => void) | undefined
  try {
    const timeout = new Promise<{ status: "timed_out" }>((resolve) => {
      timeoutHandle = setTimeout(() => resolve({ status: "timed_out" }), input.timeoutMs)
    })
    const aborted = new Promise<{ status: "aborted" }>((resolve) => {
      if (!input.signal) return
      abortHandler = () => resolve({ status: "aborted" })
      if (input.signal.aborted) abortHandler()
      else input.signal.addEventListener("abort", abortHandler, { once: true })
    })
    const waited = await Promise.race([
      input.completion.then(
        (run) => ({ status: "resolved" as const, run }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      ),
      timeout,
      aborted,
    ])
    if (waited.status === "timed_out") {
      return { projection: unavailableLiveSmokeTerminal(input.started, "timed_out") }
    }
    if (waited.status === "aborted") {
      return { projection: unavailableLiveSmokeTerminal(input.started, "interrupted") }
    }
    if (waited.status === "rejected") {
      if (input.completionRejection === "throw") throw waited.error
      return { projection: unavailableLiveSmokeTerminal(input.started, "interrupted") }
    }
    if (!waited.run) {
      return { projection: unavailableLiveSmokeTerminal(input.started, "interrupted") }
    }

    const run = waited.run
    const snapshot = input.observabilityRepository.list({
      requestId: run.id,
      requestGroupId: run.requestGroupId,
      rootRunId: run.lineageRootRunId,
      runId: run.id,
      limit: 500,
    })
    const trace = projectTypedObservabilityTrace(snapshot.events)
    const finalization = [...trace.events]
      .reverse()
      .find((event) => event.kind === "finalization_completed")
    const finalAnswerCount = trace.events.filter(
      (event) => event.kind === "finalization_completed",
    ).length
    const executionOutcome = input.readExecutionOutcome?.(run.id)
    const decisionReceiptRefs = input.readDecisionReceiptRefs?.(
      run.id,
      run.requestGroupId,
    ) ?? { decisionReceiptOrderValid: false }
    const completedAt = (input.now ?? Date.now)()
    const firstResponseLatency = input.readFirstResponseLatency?.(
      run.id,
      run.requestGroupId,
    )
    const latencyEvidence =
      firstResponseLatency && input.startedAt !== undefined
        ? {
            ...firstResponseLatency,
            terminalResponseLatencyMs: Math.max(0, completedAt - input.startedAt),
            completedAt,
          }
        : undefined
    return {
      run,
      projection: {
        requestId: run.id,
        runId: run.id,
        requestGroupId: run.requestGroupId,
        terminalStatus: terminalStatus(run),
        typedTraceStatus: snapshot.events.length > 0 ? "ready" : "not_recorded",
        typedTraceTerminal: trace.terminal,
        typedTraceIssueCount: snapshot.issues.length + trace.issues.length,
        analysisCompleted: trace.events.some((event) => event.kind === "analysis_completed"),
        evidenceRecorded: trace.events.some((event) => event.kind === "evidence_recorded"),
        reviewCompleted: trace.events.some((event) => event.kind === "review_completed"),
        finalizationCompleted: finalization !== undefined,
        rootOwnerFinalized: run.runScope === "root" && finalAnswerCount === 1,
        finalAnswerCount,
        topologyRunCount: input.listTopologyRunsForRootRun(run.id).length,
        ...(finalization ? { auditEventId: finalization.eventId } : {}),
        ...(executionOutcome ? { executionOutcome } : {}),
        ...(latencyEvidence ? { latencyEvidence } : {}),
        ...decisionReceiptRefs,
        resultReviewReasonCodes: trace.events
          .filter((event) => event.kind === "review_completed")
          .map((event) => event.reasonCode),
      },
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    if (input.signal && abortHandler) input.signal.removeEventListener("abort", abortHandler)
  }
}

function terminalStatus(run: RootRun): LiveSmokeTerminalProjection["terminalStatus"] {
  const status: RunStatus = run.status
  return status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
    ? status
    : "interrupted"
}

export function unavailableLiveSmokeTerminal(
  started: LiveSmokeStartedIdentity,
  status: "interrupted" | "timed_out",
): LiveSmokeTerminalProjection {
  return {
    ...started,
    terminalStatus: status,
    typedTraceStatus: "unavailable",
    typedTraceTerminal: false,
    typedTraceIssueCount: 1,
    analysisCompleted: false,
    evidenceRecorded: false,
    reviewCompleted: false,
    finalizationCompleted: false,
    rootOwnerFinalized: false,
    finalAnswerCount: 0,
    topologyRunCount: 0,
    decisionReceiptOrderValid: false,
    resultReviewReasonCodes: [],
  }
}
