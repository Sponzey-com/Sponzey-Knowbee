import type Database from "better-sqlite3"

import {
  type LlmInvocationReceipt,
  buildLlmInvocationReceipt,
} from "../observability/llm-invocation-receipt.js"
import type {
  LivePerformanceEvidenceReadResult,
  LivePerformanceEvidenceRecords,
  LivePerformanceEvidenceSource,
} from "./live-performance-evidence.js"

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseReceipt(
  payload: string,
): { status: "ready"; receipt: LlmInvocationReceipt } | { status: "rejected"; reasonCode: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return { status: "rejected", reasonCode: "llm_receipt_json_invalid" }
  }
  if (!objectRecord(parsed) || !objectRecord(parsed.context)) {
    return { status: "rejected", reasonCode: "llm_receipt_shape_invalid" }
  }
  const built = buildLlmInvocationReceipt(parsed as unknown as LlmInvocationReceipt)
  return built.status === "ready"
    ? built
    : { status: "rejected", reasonCode: `llm_receipt_invalid:${built.reasonCode}` }
}

export class SqliteLivePerformanceEvidenceSource implements LivePerformanceEvidenceSource {
  constructor(private readonly database: Database.Database) {}

  read(runId: string): LivePerformanceEvidenceReadResult {
    try {
      const run = this.database
        .prepare(
          `SELECT status, created_at AS startedAt, updated_at AS finishedAt
           FROM root_runs WHERE id = ?`,
        )
        .get(runId) as LivePerformanceEvidenceRecords["run"] | undefined
      if (!run) return { status: "rejected", reasonCode: "run_not_found" }

      const receiptRows = this.database
        .prepare(
          `SELECT payload_redacted_json AS payload
           FROM orchestration_events
           WHERE run_id = ? AND source = 'llm_invocation:v1'
           ORDER BY sequence`,
        )
        .all(runId) as Array<{ payload: string }>
      const llmReceipts: LlmInvocationReceipt[] = []
      for (const row of receiptRows) {
        const parsed = parseReceipt(row.payload)
        if (parsed.status === "rejected") return parsed
        if (parsed.receipt.context.runId !== runId) {
          return { status: "rejected", reasonCode: "llm_receipt_run_mismatch" }
        }
        llmReceipts.push(parsed.receipt)
      }

      const events = this.database
        .prepare(
          `SELECT event_kind AS eventKind,
                  length(CAST(payload_redacted_json AS BLOB)) AS payloadBytes
           FROM orchestration_events
           WHERE run_id = ?
           ORDER BY sequence`,
        )
        .all(runId) as LivePerformanceEvidenceRecords["events"]
      const queueTransitions = this.database
        .prepare(
          `SELECT rowid AS sequence, created_at AS at, queue_name AS queueName,
                  event_kind AS eventKind, recovery_key AS recoveryKey
           FROM queue_backpressure_events
           WHERE run_id = ?
           ORDER BY rowid`,
        )
        .all(runId) as LivePerformanceEvidenceRecords["queueTransitions"]

      return {
        status: "ready",
        records: { run, llmReceipts, events, queueTransitions },
      }
    } catch {
      return { status: "rejected", reasonCode: "runtime_storage_read_failed" }
    }
  }
}
