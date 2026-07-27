import { buildLlmInvocationReceipt, } from "../observability/llm-invocation-receipt.js";
function objectRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseReceipt(payload) {
    let parsed;
    try {
        parsed = JSON.parse(payload);
    }
    catch {
        return { status: "rejected", reasonCode: "llm_receipt_json_invalid" };
    }
    if (!objectRecord(parsed) || !objectRecord(parsed.context)) {
        return { status: "rejected", reasonCode: "llm_receipt_shape_invalid" };
    }
    const built = buildLlmInvocationReceipt(parsed);
    return built.status === "ready"
        ? built
        : { status: "rejected", reasonCode: `llm_receipt_invalid:${built.reasonCode}` };
}
export class SqliteLivePerformanceEvidenceSource {
    database;
    constructor(database) {
        this.database = database;
    }
    read(runId) {
        try {
            const run = this.database
                .prepare(`SELECT status, created_at AS startedAt, updated_at AS finishedAt
           FROM root_runs WHERE id = ?`)
                .get(runId);
            if (!run)
                return { status: "rejected", reasonCode: "run_not_found" };
            const receiptRows = this.database
                .prepare(`SELECT payload_redacted_json AS payload
           FROM orchestration_events
           WHERE run_id = ? AND source = 'llm_invocation:v1'
           ORDER BY sequence`)
                .all(runId);
            const llmReceipts = [];
            for (const row of receiptRows) {
                const parsed = parseReceipt(row.payload);
                if (parsed.status === "rejected")
                    return parsed;
                if (parsed.receipt.context.runId !== runId) {
                    return { status: "rejected", reasonCode: "llm_receipt_run_mismatch" };
                }
                llmReceipts.push(parsed.receipt);
            }
            const events = this.database
                .prepare(`SELECT event_kind AS eventKind,
                  length(CAST(payload_redacted_json AS BLOB)) AS payloadBytes
           FROM orchestration_events
           WHERE run_id = ?
           ORDER BY sequence`)
                .all(runId);
            const queueTransitions = this.database
                .prepare(`SELECT rowid AS sequence, created_at AS at, queue_name AS queueName,
                  event_kind AS eventKind, recovery_key AS recoveryKey
           FROM queue_backpressure_events
           WHERE run_id = ?
           ORDER BY rowid`)
                .all(runId);
            return {
                status: "ready",
                records: { run, llmReceipts, events, queueTransitions },
            };
        }
        catch {
            return { status: "rejected", reasonCode: "runtime_storage_read_failed" };
        }
    }
}
//# sourceMappingURL=sqlite-live-performance-evidence-source.js.map