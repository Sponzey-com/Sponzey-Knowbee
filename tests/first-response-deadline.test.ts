import { describe, expect, it } from "vitest"

import {
  FIRST_RESPONSE_BUDGET_MS,
  createFirstResponseDeadline,
  firstResponseStageRemainingMs,
  isFirstResponseReceiptWithinDeadline,
} from "../packages/core/src/runs/first-response-deadline.ts"

describe("first response deadline", () => {
  it("creates immutable 24/1/4/1 second boundaries from one ingress timestamp", () => {
    const deadline = createFirstResponseDeadline(10_000)

    expect(deadline).toEqual({
      receivedAtMs: 10_000,
      llmDeadlineAtMs: 34_000,
      validationDeadlineAtMs: 35_000,
      deliveryDeadlineAtMs: 39_000,
      expiresAtMs: 40_000,
    })
    expect(Object.isFrozen(deadline)).toBe(true)
    expect(FIRST_RESPONSE_BUDGET_MS).toEqual({
      llm: 24_000,
      validation: 1_000,
      delivery: 4_000,
      reserve: 1_000,
      total: 30_000,
    })
  })

  it.each([
    ["llm", 10_000, 24_000],
    ["llm", 34_000, 0],
    ["validation", 34_500, 500],
    ["delivery", 38_000, 1_000],
    ["receipt", 39_500, 500],
    ["receipt", 40_001, 0],
  ] as const)("returns bounded remaining time for %s", (stage, nowMs, expected) => {
    const deadline = createFirstResponseDeadline(10_000)

    expect(firstResponseStageRemainingMs(deadline, stage, nowMs)).toBe(expected)
  })

  it("accepts only same-run delivery receipts within the total deadline", () => {
    const deadline = createFirstResponseDeadline(10_000)

    expect(isFirstResponseReceiptWithinDeadline(deadline, 10_000)).toBe(true)
    expect(isFirstResponseReceiptWithinDeadline(deadline, 40_000)).toBe(true)
    expect(isFirstResponseReceiptWithinDeadline(deadline, 40_001)).toBe(false)
    expect(isFirstResponseReceiptWithinDeadline(deadline, 9_999)).toBe(false)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects an invalid ingress timestamp: %s",
    (receivedAtMs) => {
      expect(() => createFirstResponseDeadline(receivedAtMs)).toThrow(
        "first_response_received_at_invalid",
      )
    },
  )
})
