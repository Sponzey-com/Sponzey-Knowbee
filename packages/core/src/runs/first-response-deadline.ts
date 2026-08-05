export const FIRST_RESPONSE_BUDGET_MS = Object.freeze({
  llm: 24_000,
  validation: 1_000,
  delivery: 4_000,
  reserve: 1_000,
  total: 30_000,
} as const)

export type FirstResponseDeadlineStage = "llm" | "validation" | "delivery" | "receipt"

export interface FirstResponseDeadline {
  readonly receivedAtMs: number
  readonly llmDeadlineAtMs: number
  readonly validationDeadlineAtMs: number
  readonly deliveryDeadlineAtMs: number
  readonly expiresAtMs: number
}

export interface FirstResponseDeliveryReceipt {
  readonly runId: string
  readonly receiptRef: string
  readonly deliveredAtMs: number
}

export type FirstResponseReceiptLatency =
  | {
      readonly status: "within_deadline" | "deadline_exceeded"
      readonly runId: string
      readonly receiptRef: string
      readonly latencyMs: number
    }
  | {
      readonly status: "receipt_missing"
      readonly runId: string
      readonly reasonCode:
        | "first_response_delivery_receipt_missing"
        | "first_response_delivery_run_mismatch"
        | "first_response_delivery_receipt_invalid"
    }

export function createFirstResponseDeadline(receivedAtMs: number): FirstResponseDeadline {
  if (
    !Number.isFinite(receivedAtMs) ||
    receivedAtMs < 0 ||
    receivedAtMs > Number.MAX_SAFE_INTEGER - FIRST_RESPONSE_BUDGET_MS.total
  ) {
    throw new RangeError("first_response_received_at_invalid")
  }

  const llmDeadlineAtMs = receivedAtMs + FIRST_RESPONSE_BUDGET_MS.llm
  const validationDeadlineAtMs = llmDeadlineAtMs + FIRST_RESPONSE_BUDGET_MS.validation
  const deliveryDeadlineAtMs = validationDeadlineAtMs + FIRST_RESPONSE_BUDGET_MS.delivery

  return Object.freeze({
    receivedAtMs,
    llmDeadlineAtMs,
    validationDeadlineAtMs,
    deliveryDeadlineAtMs,
    expiresAtMs: deliveryDeadlineAtMs + FIRST_RESPONSE_BUDGET_MS.reserve,
  })
}

function stageDeadlineAtMs(
  deadline: FirstResponseDeadline,
  stage: FirstResponseDeadlineStage,
): number {
  switch (stage) {
    case "llm":
      return deadline.llmDeadlineAtMs
    case "validation":
      return deadline.validationDeadlineAtMs
    case "delivery":
      return deadline.deliveryDeadlineAtMs
    case "receipt":
      return deadline.expiresAtMs
  }
}

export function firstResponseStageRemainingMs(
  deadline: FirstResponseDeadline,
  stage: FirstResponseDeadlineStage,
  nowMs: number,
): number {
  if (!Number.isFinite(nowMs)) return 0
  return Math.max(0, stageDeadlineAtMs(deadline, stage) - nowMs)
}

export function isFirstResponseReceiptWithinDeadline(
  deadline: FirstResponseDeadline,
  deliveredAtMs: number,
): boolean {
  return (
    Number.isFinite(deliveredAtMs) &&
    deliveredAtMs >= deadline.receivedAtMs &&
    deliveredAtMs <= deadline.expiresAtMs
  )
}

export function projectFirstResponseReceiptLatency(input: {
  runId: string
  deadline: FirstResponseDeadline
  receipt?: FirstResponseDeliveryReceipt
}): FirstResponseReceiptLatency {
  const receipt = input.receipt
  if (!receipt) {
    return {
      status: "receipt_missing",
      runId: input.runId,
      reasonCode: "first_response_delivery_receipt_missing",
    }
  }
  if (receipt.runId !== input.runId) {
    return {
      status: "receipt_missing",
      runId: input.runId,
      reasonCode: "first_response_delivery_run_mismatch",
    }
  }
  if (
    !receipt.receiptRef.trim() ||
    !Number.isFinite(receipt.deliveredAtMs) ||
    receipt.deliveredAtMs < input.deadline.receivedAtMs
  ) {
    return {
      status: "receipt_missing",
      runId: input.runId,
      reasonCode: "first_response_delivery_receipt_invalid",
    }
  }

  return {
    status: isFirstResponseReceiptWithinDeadline(input.deadline, receipt.deliveredAtMs)
      ? "within_deadline"
      : "deadline_exceeded",
    runId: input.runId,
    receiptRef: receipt.receiptRef,
    latencyMs: receipt.deliveredAtMs - input.deadline.receivedAtMs,
  }
}
