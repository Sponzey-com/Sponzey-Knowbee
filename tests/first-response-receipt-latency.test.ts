import { describe, expect, it } from "vitest"
import {
  createFirstResponseDeadline,
  projectFirstResponseReceiptLatency,
} from "../packages/core/src/runs/first-response-deadline.ts"
import { startIngressRun } from "../packages/core/src/runs/ingress.ts"
import { vi } from "vitest"
import { createFirstResponseReceiptRecorder } from "../packages/core/src/runs/first-response-receipt.ts"

describe("first response receipt latency", () => {
  const deadline = createFirstResponseDeadline(1_000)

  it.each([
    [30_999, 29_999],
    [31_000, 30_000],
  ])("accepts a same-run delivery receipt at %ims", (deliveredAtMs, latencyMs) => {
    expect(
      projectFirstResponseReceiptLatency({
        runId: "run-first-response",
        deadline,
        receipt: {
          runId: "run-first-response",
          receiptRef: "message-ledger:receipt-1",
          deliveredAtMs,
        },
      }),
    ).toEqual({
      status: "within_deadline",
      runId: "run-first-response",
      receiptRef: "message-ledger:receipt-1",
      latencyMs,
    })
  })

  it("distinguishes a late receipt from missing or cross-run evidence", () => {
    expect(
      projectFirstResponseReceiptLatency({
        runId: "run-first-response",
        deadline,
        receipt: {
          runId: "run-first-response",
          receiptRef: "message-ledger:receipt-late",
          deliveredAtMs: 31_001,
        },
      }),
    ).toMatchObject({ status: "deadline_exceeded", latencyMs: 30_001 })

    expect(
      projectFirstResponseReceiptLatency({
        runId: "run-first-response",
        deadline,
      }),
    ).toEqual({
      status: "receipt_missing",
      runId: "run-first-response",
      reasonCode: "first_response_delivery_receipt_missing",
    })

    expect(
      projectFirstResponseReceiptLatency({
        runId: "run-first-response",
        deadline,
        receipt: {
          runId: "run-other",
          receiptRef: "message-ledger:receipt-other",
          deliveredAtMs: 2_000,
        },
      }),
    ).toEqual({
      status: "receipt_missing",
      runId: "run-first-response",
      reasonCode: "first_response_delivery_run_mismatch",
    })
  })

  it("captures the monotonic deadline origin at ingress before root startup", () => {
    const startRootRun = vi.fn(() => ({
      runId: "run-ingress",
      sessionId: "session-ingress",
      status: "started" as const,
      finished: Promise.resolve(undefined),
    }))

    startIngressRun(
      {
        runId: "run-ingress",
        sessionId: "session-ingress",
        message: "hello",
        source: "webui",
      } as never,
      {
        startRootRun,
        monotonicNow: () => 7_000,
      },
    )

    expect(startRootRun).toHaveBeenCalledWith(
      expect.objectContaining({ firstResponseReceivedAtMs: 7_000 }),
    )
  })

  it("records only the first valid delivery receipt for a run", () => {
    const recordLatencyMetric = vi.fn()
    const recordReceipt = createFirstResponseReceiptRecorder({
      runId: "run-first-response",
      sessionId: "session-first-response",
      requestGroupId: "group-first-response",
      source: "telegram",
      deadline,
      recordLatencyMetric,
    })

    expect(
      recordReceipt({
        runId: "run-first-response",
        receiptRef: "message-ledger:first",
        deliveredAtMs: 30_999,
      }),
    ).toMatchObject({ status: "recorded", latencyMs: 29_999 })
    expect(
      recordReceipt({
        runId: "run-first-response",
        receiptRef: "message-ledger:second",
        deliveredAtMs: 31_100,
      }),
    ).toEqual({ status: "already_recorded" })
    expect(recordLatencyMetric).toHaveBeenCalledTimes(1)
  })
})
