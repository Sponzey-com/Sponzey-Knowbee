import type { recordLatencyMetric as recordLatencyMetricDefault } from "../observability/latency.js"
import {
  projectFirstResponseReceiptLatency,
  type FirstResponseDeadline,
  type FirstResponseDeliveryReceipt,
} from "./first-response-deadline.js"

export type FirstResponseReceiptRecordResult =
  | { status: "recorded"; latencyMs: number; withinDeadline: boolean }
  | { status: "already_recorded" }
  | { status: "receipt_rejected"; reasonCode: string }

export type FirstResponseReceiptRecorder = (
  receipt: FirstResponseDeliveryReceipt,
) => FirstResponseReceiptRecordResult

export function createFirstResponseReceiptRecorder(input: {
  runId: string
  sessionId: string
  requestGroupId: string
  source: string
  deadline: FirstResponseDeadline
  recordLatencyMetric: typeof recordLatencyMetricDefault
}): FirstResponseReceiptRecorder {
  let recorded = false
  return (receipt) => {
    if (recorded) return { status: "already_recorded" }
    const latency = projectFirstResponseReceiptLatency({
      runId: input.runId,
      deadline: input.deadline,
      receipt,
    })
    if (latency.status === "receipt_missing") {
      return { status: "receipt_rejected", reasonCode: latency.reasonCode }
    }
    input.recordLatencyMetric({
      name: "first_response_latency_ms",
      durationMs: latency.latencyMs,
      runId: input.runId,
      sessionId: input.sessionId,
      requestGroupId: input.requestGroupId,
      source: input.source,
      timeout: latency.status === "deadline_exceeded",
      detail: { receiptRef: latency.receiptRef },
    })
    recorded = true
    return {
      status: "recorded",
      latencyMs: latency.latencyMs,
      withinDeadline: latency.status === "within_deadline",
    }
  }
}
