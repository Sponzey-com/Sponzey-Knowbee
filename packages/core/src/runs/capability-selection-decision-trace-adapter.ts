import {
  CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
  parseCapabilitySelectionDecisionTraceDetail,
  type CapabilitySelectionDecisionTraceSink,
} from "../contracts/capability-selection-decision-trace.js"
import type { LlmInvocationReceiptRepository } from "../observability/llm-invocation-receipt-repository.js"
import { insertDecisionTrace } from "../db/index.js"

const CAPABILITY_OPERATIONS = new Set([
  "capability_selection",
  "capability_selection_schema_repair",
])
const TRACE_REASON_CODES = new Set([
  "capability_selection_allowed",
  "capability_selection_approval_required",
  "capability_selection_rejected",
  "capability_selection_context_invalid",
  "capability_selection_provider_failed",
  "capability_selection_timed_out",
  "capability_selection_output_limit_exceeded",
  "capability_selection_invalid_output",
  "capability_selection_cancelled",
])
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u

export function createSqliteCapabilitySelectionDecisionTraceSink(input: {
  requestGroupId?: string
  sessionId?: string
  source?: string
  receiptRepository: LlmInvocationReceiptRepository
  now?: () => number
}): CapabilitySelectionDecisionTraceSink {
  return {
    record(record) {
      if (
        !SAFE_REFERENCE.test(record.runId) ||
        !SAFE_REFERENCE.test(record.decisionReceiptId) ||
        !TRACE_REASON_CODES.has(record.reasonCode)
      ) {
        return { status: "failed", reasonCode: "trace_detail_invalid" }
      }
      const parsed = parseCapabilitySelectionDecisionTraceDetail({
        schemaVersion: CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
        ...record.detail,
      })
      if (parsed.status === "rejected") {
        return { status: "failed", reasonCode: "trace_detail_invalid" }
      }
      try {
        const invocationRefs = input.receiptRepository
          .list({ runId: record.runId, limit: 100 })
          .filter(
            (receipt) =>
              receipt.phase !== "started" &&
              CAPABILITY_OPERATIONS.has(receipt.context.operationCode),
          )
          .sort((left, right) => left.at - right.at || left.invocationId.localeCompare(right.invocationId))
          .map((receipt) => receipt.invocationId)
          .filter((reference) => SAFE_REFERENCE.test(reference))
        const receiptIds = [record.decisionReceiptId, ...new Set(invocationRefs)]
        const traceId = insertDecisionTrace({
          runId: record.runId,
          ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ...(input.source ? { source: input.source, channel: input.source } : {}),
          decisionKind: "capability_selection",
          reasonCode: record.reasonCode,
          receiptIds,
          detail: { ...parsed.detail },
          createdAt: input.now?.() ?? Date.now(),
        })
        return { status: "stored", traceId }
      } catch {
        return { status: "failed", reasonCode: "trace_storage_failed" }
      }
    },
  }
}
