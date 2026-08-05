import { getDb } from "../db/index.js"
import { SqliteLlmInvocationReceiptRepository } from "../db/llm-invocation-receipt-repository.js"
import { SqliteTypedObservabilityEventRepository } from "../db/typed-observability-event-repository.js"
import type { LlmInvocationReceipt } from "../observability/llm-invocation-receipt.js"
import type { TypedObservabilityEvent } from "../observability/typed-event-contract.js"
import type { ReleaseMetricRecordPort } from "./release-window-metrics-use-case.js"
import type {
  ReleaseMetricCounterReceipt,
  ReleaseMetricSample,
  ReleaseMetricSourceIssue,
  ReleaseMetricSourceSnapshot,
  ReleaseMetricStage,
  ReleaseMetricWindow,
} from "./release-window-metrics.js"

interface SafeRunRow {
  id: string
  request_group_id: string | null
  status: string
  created_at: number
  updated_at: number
}

interface SafeStepRow {
  run_id: string
  step_key: string
  status: string
  started_at: number | null
  finished_at: number | null
}

interface SafeAuditRow {
  id: string
  timestamp: number
  run_id: string | null
  source: string
  tool_name: string
  result: string
  duration_ms: number | null
  retry_count: number | null
}

interface SafeLedgerRow {
  id: string
  run_id: string | null
  event_kind: string
  status: string
  created_at: number
}

interface SafeApprovalRow {
  id: string
  run_id: string
  status: string
  requested_at: number
  consumed_at: number | null
}

interface SafeQueueRow {
  id: string
  run_id: string | null
  event_kind: string
  created_at: number
  retry_count: number
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"])
const LLM_OPERATION = /(?:llm|model|openai|anthropic|provider)/iu

function sample(input: {
  sampleId: string
  runId: string
  stage: ReleaseMetricStage
  startedAt: number
  finishedAt: number
}): ReleaseMetricSample | null {
  if (!Number.isFinite(input.startedAt) || !Number.isFinite(input.finishedAt)) return null
  if (input.finishedAt < input.startedAt) return null
  return {
    sampleId: input.sampleId,
    runId: input.runId,
    stage: input.stage,
    durationMs: input.finishedAt - input.startedAt,
    observedAt: input.finishedAt,
  }
}

function pushSample(target: ReleaseMetricSample[], candidate: ReleaseMetricSample | null): void {
  if (!candidate) return
  const existingIndex = target.findIndex(
    (item) => item.runId === candidate.runId && item.stage === candidate.stage,
  )
  if (existingIndex >= 0 && candidate.sampleId.includes(":typed:")) {
    target[existingIndex] = candidate
    return
  }
  target.push(candidate)
}

function terminalEvent(
  events: readonly TypedObservabilityEvent[],
  kind: TypedObservabilityEvent["kind"],
): TypedObservabilityEvent | undefined {
  return [...events]
    .filter((event) => event.kind === kind)
    .sort((left, right) => left.at - right.at)
    .at(-1)
}

function firstEvent(
  events: readonly TypedObservabilityEvent[],
  kinds: readonly TypedObservabilityEvent["kind"][],
): TypedObservabilityEvent | undefined {
  return events
    .filter((event) => kinds.includes(event.kind))
    .sort((left, right) => left.at - right.at)[0]
}

function appendTypedEventSamples(
  samples: ReleaseMetricSample[],
  counters: ReleaseMetricCounterReceipt[],
  runId: string,
  events: readonly TypedObservabilityEvent[],
  terminalAt: number | undefined,
): void {
  const analysisStart = firstEvent(events, ["request_received", "analysis_started"])
  const analysisEnd = terminalEvent(events, "analysis_completed")
  if (analysisStart && analysisEnd) {
    pushSample(
      samples,
      sample({
        sampleId: `${runId}:typed:analysis`,
        runId,
        stage: "analysis",
        startedAt: analysisStart.at,
        finishedAt: analysisEnd.at,
      }),
    )
  }

  const executionStart = firstEvent(events, ["execution_started"])
  const executionEnd =
    terminalEvent(events, "execution_completed") ??
    terminalEvent(events, "evidence_recorded") ??
    terminalEvent(events, "review_completed")
  if (executionStart && executionEnd) {
    pushSample(
      samples,
      sample({
        sampleId: `${runId}:typed:execution`,
        runId,
        stage: "execution",
        startedAt: executionStart.at,
        finishedAt: executionEnd.at,
      }),
    )
  }

  const evidence =
    terminalEvent(events, "evidence_recorded") ?? terminalEvent(events, "execution_completed")
  const review = terminalEvent(events, "review_completed")
  if (evidence && review) {
    pushSample(
      samples,
      sample({
        sampleId: `${runId}:typed:review`,
        runId,
        stage: "review",
        startedAt: evidence.at,
        finishedAt: review.at,
      }),
    )
  }

  const finalization = terminalEvent(events, "finalization_completed")
  if (review && finalization) {
    pushSample(
      samples,
      sample({
        sampleId: `${runId}:typed:canonical_delivery`,
        runId,
        stage: "canonical_delivery",
        startedAt: review.at,
        finishedAt: finalization.at,
      }),
    )
  }
  if (finalization && terminalAt !== undefined) {
    pushSample(
      samples,
      sample({
        sampleId: `${runId}:typed:terminal_projection`,
        runId,
        stage: "terminal_projection",
        startedAt: finalization.at,
        finishedAt: terminalAt,
      }),
    )
  }

  for (const event of events) {
    if (event.kind !== "recovery_completed") continue
    counters.push({
      receiptId: `${event.eventId}:recovery`,
      runId,
      counter: "recovery",
      amount: 1,
      observedAt: event.at,
    })
  }
}

function stepStage(stepKey: string): ReleaseMetricStage | null {
  switch (stepKey) {
    case "classified":
    case "target_selected":
      return "analysis"
    case "executing":
      return "execution"
    case "reviewing":
      return "review"
    case "finalizing":
      return "final_response"
    default:
      return null
  }
}

function countSourceIssues(
  counts: Map<ReleaseMetricSourceIssue["code"], number>,
): ReleaseMetricSourceIssue[] {
  return [...counts.entries()].map(([code, count]) => ({ code, count }))
}

function terminalInvocationReceipts(
  receipts: readonly LlmInvocationReceipt[],
): readonly LlmInvocationReceipt[] {
  const terminalByInvocation = new Map<string, LlmInvocationReceipt>()
  for (const receipt of receipts) {
    if (receipt.phase === "started") continue
    const existing = terminalByInvocation.get(receipt.invocationId)
    if (!existing || receipt.at < existing.at) {
      terminalByInvocation.set(receipt.invocationId, receipt)
    }
  }
  return [...terminalByInvocation.values()]
}

function appendLlmInvocationMetrics(
  samples: ReleaseMetricSample[],
  counters: ReleaseMetricCounterReceipt[],
  runId: string,
  receipts: readonly LlmInvocationReceipt[],
): void {
  for (const receipt of terminalInvocationReceipts(receipts)) {
    const durationMs = receipt.durationMs
    if (durationMs === undefined) continue
    counters.push({
      receiptId: `${receipt.invocationId}:llm_invocation`,
      runId,
      counter: "llm_invocation",
      amount: 1,
      observedAt: receipt.at,
    })
    pushSample(
      samples,
      sample({
        sampleId: `${receipt.invocationId}:llm_execution`,
        runId,
        stage: "llm_execution",
        startedAt: receipt.at - durationMs,
        finishedAt: receipt.at,
      }),
    )
  }
}

export class SqliteReleaseMetricRecordPort implements ReleaseMetricRecordPort {
  loadWindow(window: ReleaseMetricWindow): ReleaseMetricSourceSnapshot {
    const db = getDb()
    const samples: ReleaseMetricSample[] = []
    const counters: ReleaseMetricCounterReceipt[] = []
    const issueCounts = new Map<ReleaseMetricSourceIssue["code"], number>()
    const selectedRuns = db
      .prepare<[number, number], SafeRunRow>(
        `SELECT id, request_group_id, status, created_at, updated_at
       FROM root_runs
       WHERE created_at <= ? AND updated_at >= ?
       ORDER BY created_at ASC, id ASC
       LIMIT 501`,
      )
      .all(window.endAt, window.startAt)
    const runs = selectedRuns.slice(0, 500)
    if (selectedRuns.length > runs.length) issueCounts.set("window_limit_reached", 1)
    const runIds = new Set(runs.map((run) => run.id))
    const requestGroupOwner = new Map<string, string>()
    for (const run of runs) {
      if (run.request_group_id && !requestGroupOwner.has(run.request_group_id)) {
        requestGroupOwner.set(run.request_group_id, run.id)
      }
    }

    for (const run of runs) {
      if (TERMINAL_STATUSES.has(run.status)) {
        pushSample(
          samples,
          sample({
            sampleId: `${run.id}:run:request_total`,
            runId: run.id,
            stage: "request_total",
            startedAt: run.created_at,
            finishedAt: run.updated_at,
          }),
        )
      }
    }

    const steps = db
      .prepare<[number, number], SafeStepRow>(
        `SELECT s.run_id, s.step_key, s.status, s.started_at, s.finished_at
       FROM run_steps s
       JOIN root_runs r ON r.id = s.run_id
       WHERE r.created_at <= ? AND r.updated_at >= ?
       ORDER BY s.run_id ASC, s.step_index ASC`,
      )
      .all(window.endAt, window.startAt)
    for (const step of steps) {
      const stage = stepStage(step.step_key)
      if (
        !stage ||
        step.status !== "completed" ||
        step.started_at === null ||
        step.finished_at === null
      )
        continue
      pushSample(
        samples,
        sample({
          sampleId: `${step.run_id}:step:${step.step_key}`,
          runId: step.run_id,
          stage,
          startedAt: step.started_at,
          finishedAt: step.finished_at,
        }),
      )
    }

    const typedRepository = new SqliteTypedObservabilityEventRepository()
    const llmInvocationRepository = new SqliteLlmInvocationReceiptRepository()
    for (const run of runs) {
      const typedSnapshot = typedRepository.list({ runId: run.id, limit: 500 })
      if (typedSnapshot.events.length === 500) {
        issueCounts.set("window_limit_reached", (issueCounts.get("window_limit_reached") ?? 0) + 1)
      }
      for (const issue of typedSnapshot.issues) {
        const code: ReleaseMetricSourceIssue["code"] =
          issue.code === "stored_event_invalid" ? "stored_event_invalid" : "source_record_invalid"
        issueCounts.set(code, (issueCounts.get(code) ?? 0) + 1)
      }
      const events = typedSnapshot.events.filter(
        (event) => event.at >= window.startAt && event.at <= window.endAt,
      )
      appendTypedEventSamples(samples, counters, run.id, events, run.updated_at)

      const receipts = [
        ...llmInvocationRepository.list({ runId: run.id, limit: 2_000 }),
        ...(run.request_group_id && requestGroupOwner.get(run.request_group_id) === run.id
          ? llmInvocationRepository
              .list({ requestGroupId: run.request_group_id, limit: 2_000 })
              .filter((receipt) => !receipt.context.runId)
          : []),
      ].filter(
        (receipt, index, all) =>
          receipt.at >= window.startAt &&
          receipt.at <= window.endAt &&
          all.findIndex(
            (candidate) =>
              candidate.invocationId === receipt.invocationId && candidate.phase === receipt.phase,
          ) === index,
      )
      if (receipts.length >= 2_000) {
        issueCounts.set("window_limit_reached", (issueCounts.get("window_limit_reached") ?? 0) + 1)
      }
      appendLlmInvocationMetrics(samples, counters, run.id, receipts)
    }

    const audits = db
      .prepare<[number, number], SafeAuditRow>(
        `SELECT id, timestamp, run_id, source, tool_name, result, duration_ms, retry_count
       FROM audit_logs
       WHERE timestamp >= ? AND timestamp <= ? AND run_id IS NOT NULL
       ORDER BY timestamp ASC, id ASC`,
      )
      .all(window.startAt, window.endAt)
    for (const audit of audits) {
      if (!audit.run_id || !runIds.has(audit.run_id)) continue
      const llm = LLM_OPERATION.test(`${audit.source}:${audit.tool_name}`)
      counters.push({
        receiptId: `${audit.id}:${llm ? "llm" : "tool"}`,
        runId: audit.run_id,
        counter: llm ? "llm_invocation" : "tool_invocation",
        amount: 1,
        observedAt: audit.timestamp,
      })
      if ((audit.retry_count ?? 0) > 0) {
        counters.push({
          receiptId: `${audit.id}:retry`,
          runId: audit.run_id,
          counter: "queue_retry",
          amount: audit.retry_count ?? 0,
          observedAt: audit.timestamp,
        })
      }
      if (audit.duration_ms !== null) {
        pushSample(
          samples,
          sample({
            sampleId: `${audit.id}:duration`,
            runId: audit.run_id,
            stage: llm ? "llm_execution" : "tool_execution",
            startedAt: audit.timestamp - Math.max(0, audit.duration_ms),
            finishedAt: audit.timestamp,
          }),
        )
      }
    }

    const ledgers = db
      .prepare<[number, number], SafeLedgerRow>(
        `SELECT id, run_id, event_kind, status, created_at
       FROM message_ledger
       WHERE created_at >= ? AND created_at <= ? AND run_id IS NOT NULL
       ORDER BY created_at ASC, id ASC`,
      )
      .all(window.startAt, window.endAt)
    for (const ledger of ledgers) {
      if (!ledger.run_id || !runIds.has(ledger.run_id)) continue
      if (ledger.status === "failed" || ledger.status === "degraded") {
        counters.push({
          receiptId: `${ledger.id}:failure`,
          runId: ledger.run_id,
          counter: "delivery_failure",
          amount: 1,
          observedAt: ledger.created_at,
        })
      } else if (ledger.status === "suppressed" || ledger.event_kind.includes("duplicate")) {
        counters.push({
          receiptId: `${ledger.id}:duplicate`,
          runId: ledger.run_id,
          counter: "delivery_duplicate",
          amount: 1,
          observedAt: ledger.created_at,
        })
      }
    }

    const approvals = db
      .prepare<[number, number], SafeApprovalRow>(
        `SELECT id, run_id, status, requested_at, consumed_at
       FROM approval_registry
       WHERE requested_at <= ? AND COALESCE(consumed_at, requested_at) >= ?
       ORDER BY requested_at ASC, id ASC`,
      )
      .all(window.endAt, window.startAt)
    for (const approval of approvals) {
      if (!runIds.has(approval.run_id) || approval.consumed_at === null) continue
      pushSample(
        samples,
        sample({
          sampleId: `${approval.id}:approval_wait`,
          runId: approval.run_id,
          stage: "approval_wait",
          startedAt: approval.requested_at,
          finishedAt: approval.consumed_at,
        }),
      )
    }

    const queueRows = db
      .prepare<[number, number], SafeQueueRow>(
        `SELECT id, run_id, event_kind, created_at, retry_count
       FROM queue_backpressure_events
       WHERE created_at >= ? AND created_at <= ? AND run_id IS NOT NULL
       ORDER BY created_at ASC, id ASC`,
      )
      .all(window.startAt, window.endAt)
    const queuedByRun = new Map<string, SafeQueueRow>()
    for (const row of queueRows) {
      if (!row.run_id || !runIds.has(row.run_id)) continue
      if (row.retry_count > 0) {
        counters.push({
          receiptId: `${row.id}:queue_retry`,
          runId: row.run_id,
          counter: "queue_retry",
          amount: row.retry_count,
          observedAt: row.created_at,
        })
      }
      if (row.event_kind === "queued") {
        queuedByRun.set(row.run_id, row)
      } else if (row.event_kind === "running") {
        const queued = queuedByRun.get(row.run_id)
        if (queued) {
          pushSample(
            samples,
            sample({
              sampleId: `${queued.id}:${row.id}:queue_wait`,
              runId: row.run_id,
              stage: "queue_wait",
              startedAt: queued.created_at,
              finishedAt: row.created_at,
            }),
          )
          queuedByRun.delete(row.run_id)
        }
      }
    }

    return {
      samples,
      counters,
      measuredCounters: [
        ...(counters.some((counter) => counter.counter === "llm_invocation")
          ? (["llm_invocation"] as const)
          : []),
        "tool_invocation",
        "recovery",
        "queue_retry",
        "delivery_duplicate",
        "delivery_failure",
      ],
      runCount: runs.length,
      terminalRunCount: runs.filter((run) => TERMINAL_STATUSES.has(run.status)).length,
      issues: countSourceIssues(issueCounts),
    }
  }
}
